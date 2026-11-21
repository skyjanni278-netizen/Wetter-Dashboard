import type { DayTemperature } from '../days/day';
import type { MEAN_METHOD } from '../stats/aggregation.service';

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
