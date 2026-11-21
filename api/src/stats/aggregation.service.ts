import { Injectable } from '@nestjs/common';
import { addDays, hoursInDay, localDate, localDateTime } from '../common/berlin-time';
import type { ObservationHour, StoredDay } from '../observations/observation';

/**
 * Fachregeln über Zeilenlisten aus dem `ObservationStore` (03 B1.3 R06–R14). Reine Logik ohne Zugriff auf
 * Store oder Uhr: „jetzt“ kommt als Parameter (wie `:now` in den SQL-Abfragen ab Schritt 9), die Werte
 * bleiben ungerundet. Gerundet wird nur in den Response-Mappern (`round1`, R11).
 */

/** R09: Ein vollständiger Tag mit weniger Niederschlag ist ein Trockentag (0,09 trocken, 0,1 nicht). */
export const DRY_DAY_THRESHOLD_MM = 0.1;

/**
 * Gleitkomma-Rest beim Summieren (zehnmal 0,01 ergibt 0,0999…): Werte unterhalb dieser Toleranz unter der
 * Schwelle gelten noch als Schwelle. Echte Werte haben höchstens zwei Nachkommastellen, 0,09 bleibt trocken.
 */
const SUM_TOLERANCE = 1e-9;

/** R12: Monats- und Jahresmittel = Mittel der Tagesmittel vollständiger Tage. */
export const MEAN_METHOD = 'mean_of_daily_means';

/** Stunden eines Altbestandstags: die Datei hat immer die 24 Ortszeiten 00–23 (fester Offset, Befund Z1). */
const LEGACY_HOURS_PER_DAY = 24;

export interface TemperatureStats {
  mean: number | null;
  min: number | null;
  max: number | null;
  /** `timeLocal` der Stunde mit dem Minimum bzw. Maximum (bei Gleichstand die früheste). */
  minAt: string | null;
  maxAt: string | null;
}

export interface AggregatedHour {
  hour: ObservationHour;
  /** R08: Vorhersage (`source = "prediction"`) oder Stunde nach „jetzt“. */
  isPrediction: boolean;
}

export interface DayAggregate {
  date: string;
  isToday: boolean;
  /** R07: 23 (Beginn der Sommerzeit), 25 (Ende), sonst 24. */
  hoursExpected: number;
  hoursObserved: number;
  hoursPredicted: number;
  /** R13 und Festlegung „vollständiger Tag“ (03 B1.3). */
  complete: boolean;
  /** US01-6: jüngste vergangene Stunde von heute; an anderen Tagen `null`. */
  current: ObservationHour | null;
  observed: {
    temperature: TemperatureStats;
    precipitationSum: number | null;
    /** R09: nur bei vollständigen Tagen `true`/`false`, sonst `null` (unbekannt). */
    isDryDay: boolean | null;
  };
  predicted: {
    temperature: Pick<TemperatureStats, 'min' | 'max'>;
    precipitationSum: number | null;
  };
  hours: AggregatedHour[];
}

export interface PeriodAggregate {
  daysExpected: number;
  daysWithData: number;
  daysComplete: number;
  complete: boolean;
  monthsWithData: number;
  temperature: TemperatureStats;
  precipitationSum: number | null;
  dryDays: number;
}

export interface HourRecord {
  value: number;
  date: string;
  timeLocal: string;
  hour: ObservationHour;
}

export interface RecordsAggregate {
  hottest: HourRecord | null;
  coldest: HourRecord | null;
  wettestDay: { value: number; date: string } | null;
  longestDryPeriod: { days: number; from: string; to: string } | null;
  /** Zahl der vollständigen Tage (nur sie zählen für Tagesrekorde und Trockenperioden). */
  daysCounted: number;
}

/** Laufende Trockenserie (R10). */
interface DryRun {
  from: string;
  to: string;
  days: number;
}

/** R08: Beginnt die Stunde nach „jetzt“? Die aktuelle volle Stunde (14:00 bei 14:30) ist vergangen. */
function startsAfter(hour: ObservationHour, now: Date): boolean {
  if (hour.timeUtc !== null) return Date.parse(hour.timeUtc) > now.getTime();
  // Altbestand ohne UTC-Zeitpunkt: Vergleich der Berliner Ortszeiten (gleiches Format `YYYY-MM-DDTHH:MM`).
  return hour.timeLocal > localDateTime(now);
}

/** R08: Vorhersage, wenn sie als solche gespeichert wurde (auch veraltet) oder nach „jetzt“ beginnt. */
export function isPredictionHour(hour: ObservationHour, now: Date): boolean {
  return hour.source === 'prediction' || startsAfter(hour, now);
}

/** R14: `null` ignorieren; ohne einen einzigen Wert `null` (nie 0). */
function sumOrNull(values: readonly (number | null)[]): number | null {
  let sum: number | null = null;
  for (const value of values) {
    if (value !== null) sum = (sum ?? 0) + value;
  }
  return sum;
}

/** R11/R14: Mittel, Min, Max ungerundet über die vorhandenen Werte; Gleichstand → früheste Stunde. */
function temperatureStats(hours: readonly ObservationHour[]): TemperatureStats {
  const stats: TemperatureStats = { mean: null, min: null, max: null, minAt: null, maxAt: null };
  let sum = 0;
  let count = 0;
  for (const hour of hours) {
    const t = hour.temperature;
    if (t === null) continue;
    sum += t;
    count++;
    if (stats.min === null || t < stats.min) {
      stats.min = t;
      stats.minAt = hour.timeLocal;
    }
    if (stats.max === null || t > stats.max) {
      stats.max = t;
      stats.maxAt = hour.timeLocal;
    }
  }
  stats.mean = count > 0 ? sum / count : null;
  return stats;
}

/** Tage eines Monats `YYYY-MM` (28–31, R13). */
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Tage eines Jahres (365/366). */
export function daysInYear(year: number): number {
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
}

@Injectable()
export class AggregationService {
  /**
   * Tagesaggregat aus den Stunden eines Berliner Kalendertags (R06–R09, R13, R14).
   * `observed` enthält nur vergangene Stunden, `predicted` nur Vorhersagen (US01-3, F13).
   */
  aggregateDay(date: string, hours: readonly ObservationHour[], now: Date): DayAggregate {
    const today = localDate(now);
    const views = hours.map(hour => ({ hour, isPrediction: isPredictionHour(hour, now) }));
    const observed = views.filter(v => !v.isPrediction).map(v => v.hour);
    const predicted = views.filter(v => v.isPrediction).map(v => v.hour);
    const hoursExpected = hoursInDay(date);

    // Übergang bis Schritt 9 (Befund Z1): Altbestandstage haben die 24 Ortszeiten 00–23 mit festem Offset.
    // Am 25.10. fehlt dort keine Stunde, am 29.03. steht die nicht existierende 02:00 darin.
    const requiredHours = observed.some(h => h.timeUtc === null)
      ? Math.min(hoursExpected, LEGACY_HOURS_PER_DAY)
      : hoursExpected;
    const complete =
      date < today && // R13: heute ist nie vollständig
      predicted.length === 0 &&
      observed.length >= requiredHours &&
      observed.every(h => h.temperature !== null && h.precipitation !== null); // R14

    const precipitationSum = sumOrNull(observed.map(h => h.precipitation));
    const predictedTemperature = temperatureStats(predicted);
    return {
      date,
      isToday: date === today,
      hoursExpected,
      hoursObserved: observed.length,
      hoursPredicted: predicted.length,
      complete,
      current: date === today && observed.length > 0 ? observed[observed.length - 1] : null,
      observed: {
        temperature: temperatureStats(observed),
        precipitationSum,
        isDryDay:
          complete && precipitationSum !== null ? precipitationSum < DRY_DAY_THRESHOLD_MM - SUM_TOLERANCE : null,
      },
      predicted: {
        temperature: { min: predictedTemperature.min, max: predictedTemperature.max },
        precipitationSum: sumOrNull(predicted.map(h => h.precipitation)),
      },
      hours: views,
    };
  }

  /** Tagesaggregate für die Tage aus `ObservationStore.getRange` (aufsteigend). */
  aggregateDays(days: readonly StoredDay[], now: Date): DayAggregate[] {
    return days.map(day => this.aggregateDay(day.date, day.hours, now));
  }

  /**
   * Zusammenfassung eines Zeitraums (Monat, Jahr) aus Tagesaggregaten (R12, R13). Summen, Mittel,
   * Extremwerte und Trockentage zählen nur vollständige Tage; das Mittel ist das Mittel der Tagesmittel.
   */
  summarize(days: readonly DayAggregate[], daysExpected: number): PeriodAggregate {
    const completeDays = days.filter(day => day.complete);
    const temperature: TemperatureStats = { mean: null, min: null, max: null, minAt: null, maxAt: null };
    let meanSum = 0;
    let meanCount = 0;
    for (const day of completeDays) {
      const t = day.observed.temperature;
      if (t.mean !== null) {
        meanSum += t.mean;
        meanCount++;
      }
      if (t.min !== null && (temperature.min === null || t.min < temperature.min)) {
        temperature.min = t.min;
        temperature.minAt = t.minAt;
      }
      if (t.max !== null && (temperature.max === null || t.max > temperature.max)) {
        temperature.max = t.max;
        temperature.maxAt = t.maxAt;
      }
    }
    temperature.mean = meanCount > 0 ? meanSum / meanCount : null;

    return {
      daysExpected,
      daysWithData: days.length,
      daysComplete: completeDays.length,
      complete: completeDays.length === daysExpected,
      monthsWithData: new Set(days.map(day => day.date.slice(0, 7))).size,
      temperature,
      precipitationSum: sumOrNull(completeDays.map(day => day.observed.precipitationSum)),
      dryDays: completeDays.filter(day => day.observed.isDryDay === true).length,
    };
  }

  /**
   * Rekorde (R10, R11): `hottest`/`coldest` = höchster bzw. niedrigster vergangener Stundenwert (auch
   * von heute, nie eine Vorhersage), `wettestDay` = höchste Tagessumme vollständiger Tage, längste
   * Trockenperiode über aufeinanderfolgende Kalendertage. Gleichstand → das früheste Ereignis.
   */
  records(days: readonly DayAggregate[]): RecordsAggregate {
    let hottest: HourRecord | null = null;
    let coldest: HourRecord | null = null;
    let wettestDay: RecordsAggregate['wettestDay'] = null;
    let longest: RecordsAggregate['longestDryPeriod'] = null;
    let run: DryRun | null = null;
    let daysCounted = 0;

    for (const day of days) {
      for (const { hour, isPrediction } of day.hours) {
        const t = hour.temperature;
        if (isPrediction || t === null) continue;
        if (hottest === null || t > hottest.value) hottest = { value: t, date: day.date, timeLocal: hour.timeLocal, hour };
        if (coldest === null || t < coldest.value) coldest = { value: t, date: day.date, timeLocal: hour.timeLocal, hour };
      }

      if (!day.complete) {
        run = null; // R10: unvollständiger oder unbekannter Tag beendet die Serie
        continue;
      }
      daysCounted++;
      const sum = day.observed.precipitationSum;
      if (sum !== null && (wettestDay === null || sum > wettestDay.value)) wettestDay = { value: sum, date: day.date };

      if (day.observed.isDryDay === true) {
        // R10: Abstand ≠ 1 Kalendertag (fehlender Tag) → neue Serie.
        const previous: DryRun | null = run;
        const next: DryRun =
          previous !== null && addDays(previous.to, 1) === day.date
            ? { from: previous.from, to: day.date, days: previous.days + 1 }
            : { from: day.date, to: day.date, days: 1 };
        run = next;
        if (longest === null || next.days > longest.days) longest = { days: next.days, from: next.from, to: next.to };
      } else {
        run = null;
      }
    }

    return { hottest, coldest, wettestDay, longestDryPeriod: longest, daysCounted };
  }
}
