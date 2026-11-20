import { Inject, Injectable, Logger } from '@nestjs/common';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { FORECAST_STORE } from '../forecasts/forecast.store';
import type { ForecastStore } from '../forecasts/forecast.store';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { OpenMeteoClient, OpenMeteoError } from '../weather-provider/open-meteo.client';
import type { ProviderHour } from '../weather-provider/open-meteo.client';
import type { ImportError, ImportRecord, ImportWarning } from './import';
import { planHourlyRequests } from './import-plan';
import { IMPORT_STORE } from './import.store';
import type { ImportStore, ImportUpdate } from './import.store';

/** Tage der Tagesvorhersage (US03). */
export const FORECAST_DAYS = 7;

function toImportError(error: unknown): ImportError {
  if (error instanceof OpenMeteoError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'Unerwarteter Fehler beim Import' };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Führt Importe aus (03 B3.5). `schedule` startet die Arbeit mit `setImmediate`, also ohne auf die
 * HTTP-Antwort zu warten. Stundenwerte und Tagesvorhersage werden getrennt behandelt (US08-2, F01):
 * Scheitert nur die Tagesvorhersage, bleiben die Stunden gespeichert und der Import wird `partial`.
 * Ist eine Antwort für die Stundenwerte ungültig (R32), wird nichts geschrieben und der Import `failed`.
 */
@Injectable()
export class ImportRunner {
  private readonly logger = new Logger(ImportRunner.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(IMPORT_STORE) private readonly imports: ImportStore,
    @Inject(OBSERVATION_STORE) private readonly observations: ObservationStore,
    @Inject(FORECAST_STORE) private readonly forecasts: ForecastStore,
    private readonly provider: OpenMeteoClient,
    private readonly clock: Clock,
  ) {}

  /** Startet den Import im nächsten Durchlauf der Event-Loop. */
  schedule(id: number): void {
    const run = new Promise<void>(resolve => setImmediate(resolve)).then(() => this.run(id));
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
  }

  /** Wartet, bis alle angestoßenen Importe fertig sind (für Tests und das Herunterfahren). */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  /** Führt einen Import im Status `queued` aus. Wirft nie; Fehler landen im Import. */
  async run(id: number): Promise<void> {
    try {
      const record = await this.imports.findById(id);
      if (!record || record.status !== 'queued') return;
      await this.imports.update(id, { status: 'running', startedAt: formatUtc(this.clock.now()) });
      const result = await this.execute(record);
      await this.imports.update(id, { ...result, finishedAt: formatUtc(this.clock.now()) });
      this.logger.log(`Import ${id} (${record.kind} ${record.from}–${record.to}): ${result.status}`);
    } catch (error) {
      this.logger.error(`Import ${id} abgebrochen: ${errorText(error)}`);
      await this.imports
        .update(id, { status: 'failed', finishedAt: formatUtc(this.clock.now()), error: toImportError(error) })
        .catch(() => undefined);
    }
  }

  private async execute(record: ImportRecord): Promise<ImportUpdate> {
    if (record.from === null || record.to === null) {
      return { status: 'failed', error: { code: 'INTERNAL_ERROR', message: 'Import ohne Zeitraum' } };
    }

    // 1. Stundenwerte: erst alle Abfragen, dann schreiben. Ein Fehler → nichts geschrieben (R32).
    const hours: ProviderHour[] = [];
    try {
      for (const plan of planHourlyRequests(record.from, record.to, localDate(this.clock.now()))) {
        const fetched = await this.provider.fetchHourly(plan.request, HEUBACH);
        for (const hour of fetched) {
          const date = localDate(new Date(hour.timeUtc));
          if (date >= plan.fromLocal && date <= plan.toLocal) hours.push(hour);
        }
      }
    } catch (error) {
      this.logger.warn(`Import ${record.id}: Stundenwerte nicht geladen: ${errorText(error)}`);
      return { status: 'failed', error: toImportError(error) };
    }

    const written = await this.observations.upsertHours(hours, {
      mode: record.kind === 'gaps' ? 'insertMissing' : 'upsert',
      importId: record.id,
    });
    const counts = { ...written, skippedCorrected: 0 };

    // 2. Tagesvorhersage getrennt: ein Fehler macht den Import nur `partial` (US08-2, F01).
    const warnings: ImportWarning[] = [];
    try {
      const days = await this.provider.fetchDailyForecast(HEUBACH, FORECAST_DAYS);
      await this.forecasts.save({ days, fetchedAt: formatUtc(this.clock.now()), importId: record.id });
    } catch (error) {
      const code = error instanceof OpenMeteoError ? ` (${error.code})` : '';
      warnings.push({
        code: 'FORECAST_FAILED',
        message: `Tagesvorhersage nicht gespeichert${code}: ${errorText(error)}`,
      });
    }

    return { status: warnings.length > 0 ? 'partial' : 'succeeded', counts, warnings, error: null };
  }
}
