/**
 * Prüfung der Route-Parameter (V08, F11). Ungültige Werte lösen keinen Request aus;
 * die Seite zeigt stattdessen einen Hinweis.
 */
import { DATA_START } from '../config/data-range';
import { berlinToday, isValidIsoDate } from './berlin-date';

/**
 * Einordnung eines Datums aus `/tag/:date`:
 * - `invalid`: kein Datum im Format YYYY-MM-DD oder kein Kalendertag (kein Request)
 * - `future`: nach heute (Berlin), noch keine Messdaten (kein Request)
 * - `before-start`: vor DATA_START (Request wie bisher, Text aus der 404-Behandlung)
 * - `valid`: alles andere
 */
export type DayParamStatus = 'valid' | 'invalid' | 'future' | 'before-start';

export function dayParamStatus(date: string, today: string = berlinToday()): DayParamStatus {
  if (!isValidIsoDate(date)) return 'invalid';
  if (date > today) return 'future';
  if (date < DATA_START) return 'before-start';
  return 'valid';
}

/** Jahr „YYYY“ von DATA_START bis zum aktuellen Berliner Jahr, wie in der Jahresauswahl. */
export function isValidYearParam(year: string | null | undefined, today: string = berlinToday()): boolean {
  return /^\d{4}$/.test(year ?? '') && year! >= DATA_START.slice(0, 4) && year! <= today.slice(0, 4);
}

/** Monat „01“ bis „12“ (zweistellig, wie in der Monatsauswahl). */
export function isValidMonthParam(month: string | null | undefined): boolean {
  return /^(0[1-9]|1[0-2])$/.test(month ?? '');
}
