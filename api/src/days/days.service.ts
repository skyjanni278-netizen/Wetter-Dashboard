import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { assertNotInFuture } from '../common/api-validation.exception';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { AggregationService } from '../stats/aggregation.service';
import type { Day, DayList } from './day';
import { toDay, toDayListItem } from './day.mapper';

/**
 * US01 und US02: Tage aus dem `ObservationStore` mit den berechneten Feldern (Schritt 7, R06–R14).
 * Format und Kalendertag (R01) prüft vorher die Pipe; „jetzt“ für R08 kommt aus der `Clock`.
 */
@Injectable()
export class DaysService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly aggregation: AggregationService,
    private readonly clock: Clock,
  ) {}

  /** Berliner Datum von heute. */
  today(): string {
    return localDate(this.clock.now());
  }

  findToday(): Promise<Day> {
    return this.findOne(this.today());
  }

  /**
   * R02 (US02-4): ein Tag nach dem Berliner Heute → 400 `DATE_IN_FUTURE` am Feld `date`.
   * R03 (US02-5): ein Tag ohne einzige Stunde (vor dem Datenbeginn oder danach, auch heute ohne
   * Datei) → 404 `NO_DATA` mit `details.dataFrom` = erster Tag mit Daten laut Store.
   */
  async findOne(date: string): Promise<Day> {
    const now = this.clock.now();
    assertNotInFuture('date', date, localDate(now));
    const hours = await this.store.getDay(date);
    if (!hours || hours.length === 0) {
      const { from } = await this.store.getDataRange();
      throw ApiException.noData(date, from);
    }
    return toDay(this.aggregation.aggregateDay(date, hours, now));
  }

  /**
   * US04-2/-9 (R23): Tage `from`–`to` mit mindestens einer Stunde, aufsteigend nach Datum. Form und
   * Spanne prüft vorher `DaysQuerySchema`; hier R02: `to` nach dem Berliner Heute → 400 `DATE_IN_FUTURE`
   * am Feld `to`. Tage ohne Daten fehlen in der Liste; ein Zeitraum ganz ohne Daten ergibt `items = []` (R03).
   */
  async findRange(from: string, to: string): Promise<DayList> {
    const now = this.clock.now();
    assertNotInFuture('to', to, localDate(now));
    const days = await this.store.getRange(from, to);
    const items = this.aggregation.aggregateDays(days, now).map(toDayListItem);
    return { items, meta: { from, to, count: items.length } };
  }
}
