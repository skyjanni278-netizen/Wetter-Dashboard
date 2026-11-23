import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { formatDateDe } from '../common/api-error';
import { ApiValidationException, assertNotInFuture } from '../common/api-validation.exception';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { round1 } from '../common/round';
import { toDayTemperature } from '../days/day.mapper';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import { AggregationService, daysInMonth, daysInRange, daysInYear, MEAN_METHOD } from '../stats/aggregation.service';
import type { DayAggregate, PeriodAggregate } from '../stats/aggregation.service';
import { RevisionCache } from '../stats/revision-cache';
import type { MonthSummary, MonthSummaryList, PeriodSummary, YearList, YearSummary } from './summary';

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

/** R27 (US18): Kenntage als Kopie (ganze Zahlen, nichts zu runden). */
function indicatorValues(period: PeriodAggregate) {
  const { frostDays, iceDays, summerDays, hotDays, precipitationDays } = period.indicators;
  return { frostDays, iceDays, summerDays, hotDays, precipitationDays };
}

/**
 * US04-1/-3/-4/-5/-6/-8, US05-1 bis -6: Monats- und Jahreszusammenfassungen und ihre Listen aus
 * Tagesaggregaten (R12, R13); seit Schritt 12b mit `indicators` (R27, US18) und dem freien Zeitraum (R28, US19).
 * Format (R04, R05) prüft die Pipe; Zukunft (R02) und „keine Daten“ (R03) prüft dieser Service.
 */
@Injectable()
export class SummariesService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly aggregation: AggregationService,
    private readonly clock: Clock,
    private readonly cache: RevisionCache,
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
    return toMonthSummary(yearMonth, period);
  }

  /**
   * US05-2/-6: Zusammenfassungen aller Monate des Jahres mit mindestens einer Stunde, aufsteigend; je Monat
   * dieselben Werte wie `findMonth`. R05: Jahr nach dem laufenden → 400 `DATE_IN_FUTURE` an `year`;
   * Jahr ohne einzige Stunde → 404 `NO_DATA` (R03).
   */
  async findMonths(year: number): Promise<MonthSummaryList> {
    const now = this.clock.now();
    const today = localDate(now);
    if (year > Number(today.slice(0, 4))) throw ApiValidationException.dateInFuture('year', today);

    const days = await this.daysUntilToday(`${year}-01-01`, `${year}-12-31`, `das Jahr ${year}`);
    const items = [...groupBy(days, day => day.date.slice(0, 7))].map(([yearMonth, monthDays]) =>
      toMonthSummary(yearMonth, this.aggregation.summarize(monthDays, daysInMonth(yearMonth))),
    );
    return { items };
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
      indicators: indicatorValues(period),
      meanMethod: MEAN_METHOD,
    };
  }

  /**
   * R28 (US19-1 bis -6): freier Zeitraum in der Form der Jahreszusammenfassung. Format, `from ≤ to`, höchstens
   * 366 Tage und unbekannte Parameter prüft die Pipe (`PeriodsQuerySchema`); `to` nach heute → 400
   * `DATE_IN_FUTURE` an `to` (R02), keine einzige Stunde im Zeitraum → 404 `NO_DATA` (R03).
   * `daysExpected` = Kalendertage von `from` bis `to`; nicht gecacht, wie `findYear` (beliebige Schlüssel).
   */
  async findPeriod(from: string, to: string): Promise<PeriodSummary> {
    const today = localDate(this.clock.now());
    assertNotInFuture('to', to, today);

    const label = `den Zeitraum ${formatDateDe(from)} bis ${formatDateDe(to)}`;
    const period = await this.summarize(from, to, daysInRange(from, to), label);
    return {
      id: `${from}..${to}`,
      from,
      to,
      ...summaryValues(period),
      complete: period.complete,
      temperature: toDayTemperature(period.temperature),
      precipitationSum: round1(period.precipitationSum),
      dryDays: period.dryDays,
      indicators: indicatorValues(period),
      meanMethod: MEAN_METHOD,
    };
  }

  /**
   * US04-8 (F20): Jahre mit mindestens einer Stunde vom Datenbeginn bis heute, aufsteigend, in der Form
   * „year list“ aus B2.2 (`complete`, `daysComplete` wie `findYear`). Ohne Daten `items = []`.
   */
  findYears(): Promise<YearList> {
    const now = this.clock.now();
    return this.cache.get('summaries/years', now, () => this.computeYears(now));
  }

  /** Ungecachte Fassung von `findYears` (Schlüssel und Gültigkeit: `RevisionCache`, B2.4). */
  private async computeYears(now: Date): Promise<YearList> {
    const today = localDate(now);
    const { from, to } = await this.store.getDataRange();
    if (from === null || to === null || from > today) return { items: [] };

    const days = this.aggregation.aggregateDays(await this.store.getRange(from, to < today ? to : today), now);
    const items = [...groupBy(days, day => day.date.slice(0, 4))].map(([id, yearDays]) => {
      const year = Number(id);
      const period = this.aggregation.summarize(yearDays, daysInYear(year));
      return { id, year, complete: period.complete, daysComplete: period.daysComplete };
    });
    return { items };
  }

  /** Tagesaggregate bis höchstens heute; ohne eine einzige Stunde → 404 `NO_DATA` (R03). */
  private async daysUntilToday(from: string, to: string, label: string): Promise<DayAggregate[]> {
    const now = this.clock.now();
    const today = localDate(now);
    const days = await this.store.getRange(from, to < today ? to : today);
    if (days.length === 0) {
      const range = await this.store.getDataRange();
      throw ApiException.noDataFor(label, range.from);
    }
    return this.aggregation.aggregateDays(days, now);
  }

  private async summarize(from: string, to: string, daysExpected: number, label: string): Promise<PeriodAggregate> {
    return this.aggregation.summarize(await this.daysUntilToday(from, to, label), daysExpected);
  }
}

/** Response-Mapper einer Monatszusammenfassung (R11: gerundet erst hier). */
function toMonthSummary(yearMonth: string, period: PeriodAggregate): MonthSummary {
  const [year, month] = yearMonth.split('-').map(Number);
  return {
    id: yearMonth,
    year,
    month,
    ...summaryValues(period),
    complete: period.complete,
    temperature: toDayTemperature(period.temperature),
    precipitationSum: round1(period.precipitationSum),
    dryDays: period.dryDays,
    indicators: indicatorValues(period),
    meanMethod: MEAN_METHOD,
  };
}

/** Gruppiert eine aufsteigende Tagesliste; die Reihenfolge der Gruppen bleibt aufsteigend. */
function groupBy(days: readonly DayAggregate[], key: (day: DayAggregate) => string): Map<string, DayAggregate[]> {
  const groups = new Map<string, DayAggregate[]>();
  for (const day of days) {
    const k = key(day);
    const list = groups.get(k);
    if (list) list.push(day);
    else groups.set(k, [day]);
  }
  return groups;
}
