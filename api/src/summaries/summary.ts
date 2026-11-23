import type { DayTemperature } from '../days/day';
import type { MEAN_METHOD } from '../stats/aggregation.service';

/** R27 (US18): Kenntage über die vollständigen Tage; `dryDays` steht oben in der Zusammenfassung (B2.2). */
export interface SummaryIndicators {
  frostDays: number;
  iceDays: number;
  summerDays: number;
  hotDays: number;
  precipitationDays: number;
}

/** Gemeinsame Felder der Zusammenfassungen (03 B2.2); Werte gerundet (R11), `meanMethod` nach R12. */
interface SummaryBase {
  locationId: number;
  daysExpected: number;
  daysComplete: number;
  /** R13: `daysComplete = daysExpected`. */
  complete: boolean;
  /** Mittel = Mittel der Tagesmittel, Min/Max = Extremwerte der Stunden, nur vollständige Tage. */
  temperature: DayTemperature;
  precipitationSum: number | null;
  dryDays: number;
  /** Seit Schritt 12b (R27, US18). */
  indicators: SummaryIndicators;
  meanMethod: typeof MEAN_METHOD;
}

/** `GET /api/summaries/months/:yearMonth` */
export interface MonthSummary extends SummaryBase {
  id: string;
  year: number;
  month: number;
}

/** `GET /api/summaries/years/:year` */
export interface YearSummary extends SummaryBase {
  id: string;
  year: number;
  monthsWithData: number;
}

/**
 * `GET /api/summaries/periods?from&to` (R28, US19, seit Schritt 12b): freier Zeitraum in der Form der
 * Jahreszusammenfassung (B2.2 „period summary“), `id = "{from}..{to}"`, dazu `from` und `to`.
 */
export interface PeriodSummary extends SummaryBase {
  id: string;
  from: string;
  to: string;
}

/** `GET /api/summaries/months?year=`: Monate des Jahres mit Daten, aufsteigend (US05-2). */
export interface MonthSummaryList {
  items: MonthSummary[];
}

/** Eintrag der Jahresliste (03 B2.2 „year list“, für die Jahresauswahl, US04-8). */
export interface YearListItem {
  id: string;
  year: number;
  complete: boolean;
  daysComplete: number;
}

/** `GET /api/summaries/years`: Jahre mit Daten, aufsteigend (F20). */
export interface YearList {
  items: YearListItem[];
}
