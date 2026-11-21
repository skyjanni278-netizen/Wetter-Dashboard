import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { ApiValidationException } from '../common/api-validation.exception';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { round1 } from '../common/round';
import { toDayTemperature } from '../days/day.mapper';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { AggregationService, daysInMonth, daysInYear, MEAN_METHOD } from '../stats/aggregation.service';
import type { PeriodAggregate } from '../stats/aggregation.service';
import type { MonthSummary, YearSummary } from './summary';

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** Gemeinsame Zählfelder von Monat und Jahr (die Werte rundet der Mapper unten mit `round1`, R11). */
function summaryValues(period: PeriodAggregate) {
  return {
    locationId: HEUBACH.id,
    daysExpected: period.daysExpected,
    daysComplete: period.daysComplete,
  };
}

/**
 * US04-1/-3/-4/-5/-6, US05-1/-3/-4/-5: Monats- und Jahreszusammenfassung aus Tagesaggregaten (R12, R13).
 * Format (R04, R05) prüft die Pipe; Zukunft (R02) und „keine Daten“ (R03) prüft dieser Service.
 */
@Injectable()
export class SummariesService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly aggregation: AggregationService,
    private readonly clock: Clock,
  ) {}

  /** R02: Monat nach dem laufenden → 400 `DATE_IN_FUTURE` an `yearMonth`; laufender Monat gültig. */
  async findMonth(yearMonth: string): Promise<MonthSummary> {
    const now = this.clock.now();
    const today = localDate(now);
    if (yearMonth > today.slice(0, 7)) throw ApiValidationException.dateInFuture('yearMonth', today);

    const [year, month] = yearMonth.split('-').map(Number);
    const period = await this.summarize(
      `${yearMonth}-01`,
      `${yearMonth}-${String(daysInMonth(yearMonth)).padStart(2, '0')}`,
      daysInMonth(yearMonth),
      `${MONTH_NAMES[month - 1]} ${year}`,
    );
    return {
      id: yearMonth,
      year,
      month,
      ...summaryValues(period),
      complete: period.complete,
      temperature: toDayTemperature(period.temperature),
      precipitationSum: round1(period.precipitationSum),
      dryDays: period.dryDays,
      meanMethod: MEAN_METHOD,
    };
  }

  /** R05: Jahr nach dem laufenden → 400 `DATE_IN_FUTURE` an `year`; das Jahresmittel kommt direkt aus den Tagesmitteln (R12). */
  async findYear(year: number): Promise<YearSummary> {
    const now = this.clock.now();
    const today = localDate(now);
    if (year > Number(today.slice(0, 4))) throw ApiValidationException.dateInFuture('year', today);

    const period = await this.summarize(`${year}-01-01`, `${year}-12-31`, daysInYear(year), `das Jahr ${year}`);
    return {
      id: String(year),
      year,
      ...summaryValues(period),
      monthsWithData: period.monthsWithData,
      complete: period.complete,
      temperature: toDayTemperature(period.temperature),
      precipitationSum: round1(period.precipitationSum),
      dryDays: period.dryDays,
      meanMethod: MEAN_METHOD,
    };
  }

  /** Tage bis höchstens heute; ohne eine einzige Stunde → 404 `NO_DATA` (R03). */
  private async summarize(from: string, to: string, daysExpected: number, label: string): Promise<PeriodAggregate> {
    const now = this.clock.now();
    const today = localDate(now);
    const days = await this.store.getRange(from, to < today ? to : today);
    if (days.length === 0) {
      const range = await this.store.getDataRange();
      throw ApiException.noDataFor(label, range.from);
    }
    return this.aggregation.summarize(this.aggregation.aggregateDays(days, now), daysExpected);
  }
}
