/**
 * Prüfung eines Zeitraums Von/Bis im Browser (Importformular, Lücken; R18, US10-4/-5/-6, US12-2).
 * Die Meldungen entsprechen denen der API (`ImportCreateSchema`, `GapsQuerySchema`), damit Client- und
 * Serverfehler am Feld gleich lauten. Der Server prüft trotzdem selbst (Sicherheit liegt im Backend).
 */
import { addDays, formatDateDe, isValidIsoDate } from './berlin-date';

/** Höchste Spanne in Tagen, `from` und `to` mitgezählt (wie `MAX_IMPORT_DAYS`/`MAX_GAP_DAYS` der API). */
export const MAX_RANGE_DAYS = 1096;

export const FROM_REQUIRED_MESSAGE = 'Bitte ein Startdatum wählen.';
export const TO_REQUIRED_MESSAGE = 'Bitte ein Enddatum wählen.';
export const INVALID_DATE_MESSAGE = 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.';
export const TO_BEFORE_FROM_MESSAGE = 'Das Enddatum darf nicht vor dem Startdatum liegen.';
export const RANGE_TOO_LONG_MESSAGE = `Der Zeitraum darf höchstens ${MAX_RANGE_DAYS} Tage umfassen.`;

/** „Das Enddatum darf nicht nach heute (22.11.2026) liegen.“ */
export function toInFutureMessage(today: string): string {
  return `Das Enddatum darf nicht nach heute (${formatDateDe(today)}) liegen.`;
}

/** Fehler je Feld; fehlt ein Schlüssel, ist das Feld in Ordnung. */
export interface DateRangeErrors {
  from?: string;
  to?: string;
}

/**
 * Prüft `from`/`to` (`YYYY-MM-DD` aus `<input type="date">`). Reihenfolge wie die API: erst Format je
 * Feld, dann `to_before_from` bzw. `range_too_long` am Feld `to`. `today` (aus `/api/status`) prüft
 * zusätzlich „nicht nach heute“ (R02); ohne `today` entfällt diese Prüfung (der Server meldet sie).
 */
export function validateDateRange(from: string, to: string, today: string | null = null): DateRangeErrors {
  const errors: DateRangeErrors = {};
  if (!from) errors.from = FROM_REQUIRED_MESSAGE;
  else if (!isValidIsoDate(from)) errors.from = INVALID_DATE_MESSAGE;
  if (!to) errors.to = TO_REQUIRED_MESSAGE;
  else if (!isValidIsoDate(to)) errors.to = INVALID_DATE_MESSAGE;
  if (errors.from || errors.to) return errors;

  if (to < from) errors.to = TO_BEFORE_FROM_MESSAGE;
  else if (to > addDays(from, MAX_RANGE_DAYS - 1)) errors.to = RANGE_TOO_LONG_MESSAGE;
  else if (today && isValidIsoDate(today) && to > today) errors.to = toInFutureMessage(today);
  return errors;
}

export function hasDateRangeErrors(errors: DateRangeErrors): boolean {
  return errors.from !== undefined || errors.to !== undefined;
}
