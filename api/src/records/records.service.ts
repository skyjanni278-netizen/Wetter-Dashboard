import { Inject, Injectable } from '@nestjs/common';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { round1 } from '../common/round';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { AggregationService } from '../stats/aggregation.service';
import type { HourRecord } from '../stats/aggregation.service';
import { RevisionCache } from '../stats/revision-cache';
import type { HourRecordResource, Records } from './record';

/** Response-Mapper eines Stundenrekords (R11: gerundet erst hier). */
function toHourRecord(record: HourRecord | null): HourRecordResource | null {
  if (record === null) return null;
  return {
    value: round1(record.value),
    timeLocal: record.timeLocal,
    date: record.date,
    observationId: null,
    corrected: false,
  };
}

/**
 * US06-1 bis -5: Rekorde über alle Tage vom Datenbeginn bis heute (R10, R11). Das Ergebnis liegt im
 * `RevisionCache` (B2.4): ein neuer Wert aus einem Import erscheint sofort, ohne Neustart.
 */
@Injectable()
export class RecordsService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly aggregation: AggregationService,
    private readonly clock: Clock,
    private readonly cache: RevisionCache,
  ) {}

  find(): Promise<Records> {
    const now = this.clock.now();
    return this.cache.get('records', now, () => this.compute(now));
  }

  private async compute(now: Date): Promise<Records> {
    const today = localDate(now);
    const { from } = await this.store.getDataRange();
    const days = from === null || from > today ? [] : await this.store.getRange(from, today);
    const records = this.aggregation.records(this.aggregation.aggregateDays(days, now));
    return {
      locationId: HEUBACH.id,
      hottest: toHourRecord(records.hottest),
      coldest: toHourRecord(records.coldest),
      wettestDay: records.wettestDay ? { value: round1(records.wettestDay.value), date: records.wettestDay.date } : null,
      longestDryPeriod: records.longestDryPeriod ? { ...records.longestDryPeriod } : null,
      daysCounted: records.daysCounted,
      excludesPredictions: true,
    };
  }
}
