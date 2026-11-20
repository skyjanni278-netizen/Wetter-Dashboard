import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, BERLIN_TIMEZONE, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import type { ImportRecord } from '../imports/import';
import { ImportAlreadyRunningError } from '../imports/import.store';
import { ImportsService } from '../imports/imports.service';
import { SCHEDULER_ENABLED } from './scheduler-enabled';

/** Jede Stunde zur Minute 5 (Sekunde 0), Berliner Zeit (03 B4.8). */
export const SCHEDULER_CRON = '0 5 * * * *';

/** Name des Cron-Jobs in der `SchedulerRegistry`. */
export const SCHEDULED_IMPORT_JOB = 'scheduled-import';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Stündlicher Abruf (US08): Der Scheduler ist nur ein Auslöser für das `ImportsModule`. Jeder Lauf legt
 * einen Import `kind = "scheduled"` für gestern und heute an (der Runner holt dazu die 7-Tage-Vorhersage).
 * R19 (US08-4): Läuft schon ein Import, wird der Lauf mit Warnung übersprungen. `tick()` wirft nie.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly imports: ImportsService,
    private readonly clock: Clock,
    @Inject(SCHEDULER_ENABLED) private readonly enabled: boolean,
  ) {}

  onApplicationBootstrap(): void {
    if (this.enabled) {
      this.logger.log(`Scheduler aktiv: ${SCHEDULER_CRON} (${BERLIN_TIMEZONE}), Import für gestern und heute`);
    } else {
      this.logger.log('Scheduler deaktiviert (SCHEDULER_ENABLED ist nicht "true")');
    }
  }

  /** Ein Scheduler-Lauf; liefert den angelegten Import oder `null` (abgeschaltet, übersprungen, Fehler). */
  @Cron(SCHEDULER_CRON, { name: SCHEDULED_IMPORT_JOB, timeZone: BERLIN_TIMEZONE })
  async tick(): Promise<ImportRecord | null> {
    if (!this.enabled) return null;

    const today = localDate(this.clock.now());
    const from = addDays(today, -1);
    try {
      const record = await this.imports.createScheduled(from, today);
      this.logger.log(`Scheduler-Lauf: Import ${record.id} (scheduled ${from}–${today}) angelegt`);
      return record;
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) {
        this.logger.warn(`Scheduler-Lauf übersprungen: Import ${error.runningImportId} läuft noch (R19)`);
      } else {
        this.logger.error(`Scheduler-Lauf fehlgeschlagen: ${errorText(error)}`);
      }
      return null;
    }
  }
}
