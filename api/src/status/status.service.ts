import { Inject, Injectable, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BERLIN_TIMEZONE, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import type { ImportKind, ImportStatus } from '../imports/import';
import { IMPORT_STORE } from '../imports/import.store';
import type { ImportStore } from '../imports/import.store';
import { HEUBACH } from '../locations/location';
import { GapsService } from '../observations/gaps.service';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { SCHEDULED_IMPORT_JOB } from '../scheduler/scheduler.service';
import { AggregationService } from '../stats/aggregation.service';
import { RevisionCache } from '../stats/revision-cache';
import type { Status, UpdateState } from './status';

/** R25: Ab diesem Alter des letzten erfolgreichen Imports gilt der Datenstand als verspätet (Annahme aus N01). */
export const UPDATE_DELAYED_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * R25: Diese Importe zählen als Aktualisierung (`legacy` nicht). Auch ein manueller `range`- oder `gaps`-Import
 * des Admins bringt neue Daten und zählt deshalb (offener Punkt aus Schritt 11, geprüft in 12a: so steht es in R25).
 */
export const UPDATE_KINDS: readonly ImportKind[] = ['scheduled', 'range', 'gaps'];
export const UPDATE_STATUSES: readonly ImportStatus[] = ['succeeded', 'partial'];

/** Name des Cache-Eintrags der Kennzahlen (R26, B2.4). */
export const COVERAGE_CACHE = 'status/coverage';

/** R25: `ok` bis einschließlich 2 h nach dem letzten erfolgreichen Import, danach `delayed`. */
export function updateStateOf(lastSuccessfulUpdateAt: string | null, now: Date): UpdateState {
  if (lastSuccessfulUpdateAt === null) return 'never';
  return now.getTime() - Date.parse(lastSuccessfulUpdateAt) <= UPDATE_DELAYED_AFTER_MS ? 'ok' : 'delayed';
}

/** Kennzahlen zur Vollständigkeit (N04, R26). */
interface Coverage {
  daysWithData: number;
  daysComplete: number;
  gapCount: number;
}

/**
 * US07, US16-1 bis -3 (N01), US17-1/-2 (N04): Datenstand, öffentlich und ohne Fehlertext.
 *
 * - `updateState` nach R25 aus dem letzten erfolgreichen Import (`ImportStore`).
 * - `nextScheduledUpdateAt` aus dem Cron-Job `scheduled-import` in der `SchedulerRegistry`, berechnet ab der
 *   `Clock` (gleiche Regel wie der Job, auch über die Zeitumstellung). Ohne `ScheduleModule`
 *   (`SCHEDULER_ENABLED=false`) gibt es keine Registry → `null` (US16-3).
 * - `daysWithData`, `daysComplete` (R13, `AggregationService`) und `gapCount` (R26, derselbe `GapsService`
 *   wie `GET /api/gaps`) über alle Tage von `dataFrom` bis heute. Das kostet eine Abfrage über den ganzen
 *   Bestand; das Ergebnis liegt deshalb im `RevisionCache` (Datenrevision plus laufende Stunde, B2.4).
 */
@Injectable()
export class StatusService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly observations: ObservationStore,
    @Inject(IMPORT_STORE) private readonly imports: ImportStore,
    private readonly clock: Clock,
    private readonly gaps: GapsService,
    private readonly aggregation: AggregationService,
    private readonly cache: RevisionCache,
    @Optional() private readonly scheduler?: SchedulerRegistry,
  ) {}

  async find(): Promise<Status> {
    const now = this.clock.now();
    const range = await this.observations.getDataRange();
    const last = await this.imports.findLastFinished({
      locationId: HEUBACH.id,
      kinds: UPDATE_KINDS,
      statuses: UPDATE_STATUSES,
    });
    const lastSuccessfulUpdateAt = last?.finishedAt ?? null;
    const coverage = await this.cache.get(COVERAGE_CACHE, now, () => this.coverage(range.from, now));
    return {
      locationId: HEUBACH.id,
      today: localDate(now),
      timezone: BERLIN_TIMEZONE,
      dataFrom: range.from,
      dataTo: range.to,
      lastSuccessfulUpdateAt,
      nextScheduledUpdateAt: this.nextScheduledUpdateAt(now),
      updateState: updateStateOf(lastSuccessfulUpdateAt, now),
      daysWithData: coverage.daysWithData,
      daysComplete: coverage.daysComplete,
      gapCount: coverage.gapCount,
    };
  }

  /** Nächster Lauf des Cron-Jobs ab „jetzt“ (UTC) oder `null` ohne aktiven Job. */
  private nextScheduledUpdateAt(now: Date): string | null {
    if (!this.scheduler?.doesExist('cron', SCHEDULED_IMPORT_JOB)) return null;
    const job = this.scheduler.getCronJob(SCHEDULED_IMPORT_JOB);
    if (!job.isActive) return null;
    return formatUtc(job.cronTime.getNextDateFrom(now).toJSDate());
  }

  private async coverage(dataFrom: string | null, now: Date): Promise<Coverage> {
    const today = localDate(now);
    if (dataFrom === null || dataFrom > today) return { daysWithData: 0, daysComplete: 0, gapCount: 0 };
    const days = this.aggregation.aggregateDays(await this.observations.getRange(dataFrom, today), now);
    const gaps = await this.gaps.find(dataFrom, today);
    return {
      daysWithData: days.length,
      daysComplete: days.filter(day => day.complete).length,
      gapCount: gaps.items.length,
    };
  }
}
