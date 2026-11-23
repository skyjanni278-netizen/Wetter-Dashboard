import { addDays } from './berlin-date';
import { monthLabel } from './page-title';

/**
 * Vorjahresvergleich (N06, 03 R29, US19).
 *
 * - **Vollständiger** Monat bzw. vollständiges Jahr (das letzte Kalenderdatum liegt vor heute): Vergleich mit
 *   demselben Monat bzw. Jahr minus 1 über die normalen Endpunkte `/summaries/months/{ym}` bzw. `/summaries/years/{y}`.
 * - **Unvollständiger** (laufender) Zeitraum: beide Seiten vom Anfangstag bis **gestern** (heute laut Server),
 *   über `/summaries/periods`. Der 29.02. wird im Vorjahr zum 28.02.
 * - Differenz = gerundeter Wert − gerundeter Vorjahreswert, damit die angezeigten Zahlen zusammenpassen.
 */

/** Zeitraum `from` bis `to` (`YYYY-MM-DD`, beide mitgezählt). */
export interface DateRange {
  from: string;
  to: string;
}

/** Was der Vergleich abfragt. */
export type ComparePlan =
  /** Vollständiger Zeitraum: `previousId` ist `YYYY-MM` (Monat) bzw. `YYYY` (Jahr). */
  | { kind: 'calendar'; previousYear: string; previousId: string; label: string }
  /** Laufender Zeitraum: zwei Requests auf `/summaries/periods` mit denselben Kalendertagen bis gestern. */
  | { kind: 'period'; previousYear: string; current: DateRange; previous: DateRange; label: string }
  /** Kein vollständiger Tag zum Vergleichen (heute ist der erste Tag des Zeitraums, oder er liegt in der Zukunft). */
  | { kind: 'none'; previousYear: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(date: string): [number, number, number] {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Ungültiges Datum: "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Derselbe Kalendertag ein Jahr früher; den 29.02. gibt es im Vorjahr nicht, er wird zum 28.02. */
export function previousYearDate(date: string): string {
  const [y, m, d] = parse(date);
  const day = Math.min(d, lastDayOfMonth(y - 1, m));
  return `${pad(y - 1, 4)}-${pad(m)}-${pad(day)}`;
}

/** R29: Vorjahreszeitraum mit denselben Kalendertagen, z. B. 2028-01-01..2028-02-29 → 2027-01-01..2027-02-28. */
export function previousYearRange(from: string, to: string): DateRange {
  return { from: previousYearDate(from), to: previousYearDate(to) };
}

/**
 * Kurzform eines Zeitraums für den Differenztext: „01.–18.11.2025“ (ein Monat), „01.01.–18.11.2025“
 * (ein Jahr), „01.11.2025“ (ein Tag), sonst „30.12.2025–02.01.2026“.
 */
export function rangeLabel(range: DateRange): string {
  const [fy, fm, fd] = parse(range.from);
  const [ty, tm, td] = parse(range.to);
  const to = `${pad(td)}.${pad(tm)}.${ty}`;
  if (range.from === range.to) return to;
  if (fy !== ty) return `${pad(fd)}.${pad(fm)}.${fy}–${to}`;
  if (fm !== tm) return `${pad(fd)}.${pad(fm)}.–${to}`;
  return `${pad(fd)}.–${to}`;
}

/** Plan für Anfang `start` und Ende `end` des Zeitraums, gemessen an heute laut Server. */
function plan(start: string, end: string, today: string, previousYear: string, calendar: () => ComparePlan): ComparePlan {
  if (end < today) return calendar();
  const yesterday = addDays(today, -1);
  if (yesterday < start) return { kind: 'none', previousYear };
  const current = { from: start, to: yesterday };
  const previous = previousYearRange(current.from, current.to);
  return { kind: 'period', previousYear, current, previous, label: rangeLabel(previous) };
}

/** Vergleichsplan für den Monat `year`/`month` (`YYYY`, `MM`) bei heute `today` (`status.today`). */
export function monthComparePlan(year: string, month: string, today: string): ComparePlan {
  const y = Number(year);
  const m = Number(month);
  const previousYear = String(y - 1);
  const start = `${pad(y, 4)}-${pad(m)}-01`;
  const end = `${pad(y, 4)}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
  return plan(start, end, today, previousYear, () => ({
    kind: 'calendar', previousYear, previousId: `${pad(y - 1, 4)}-${pad(m)}`, label: monthLabel(y - 1, m),
  }));
}

/** Vergleichsplan für das Jahr `year` (`YYYY`) bei heute `today` (`status.today`). */
export function yearComparePlan(year: string, today: string): ComparePlan {
  const y = Number(year);
  const previousYear = String(y - 1);
  return plan(`${pad(y, 4)}-01-01`, `${pad(y, 4)}-12-31`, today, previousYear, () => ({
    kind: 'calendar', previousYear, previousId: previousYear, label: previousYear,
  }));
}

/** Rundung wie bei der Anzeige (`toLocaleString`, halbe Stelle von null weg). */
function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

/** R29: gerundeter Wert − gerundeter Vorjahreswert; fehlt einer der Werte, `null`. */
export function roundedDiff(current: number | null | undefined, previous: number | null | undefined, digits = 1): number | null {
  if (current === null || current === undefined || !Number.isFinite(current)) return null;
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  return round(round(current, digits) - round(previous, digits), digits);
}

/** „+0,4“ bzw. „−0,4“ (echtes Minuszeichen) mit festen Nachkommastellen. */
function signed(diff: number, digits: number): string {
  const text = Math.abs(diff).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${diff > 0 ? '+' : '−'}${text}`;
}

/** „+0,4 °C wärmer als 01.01.–18.11.2025“, „−0,4 °C kälter als …“, „gleich warm wie …“ (US19-7). */
export function temperatureDiffText(diff: number | null, label: string, digits = 1): string {
  if (diff === null) return `kein Vergleichswert für ${label}`;
  if (diff === 0) return `gleich warm wie ${label}`;
  return `${signed(diff, digits)} °C ${diff > 0 ? 'wärmer' : 'kälter'} als ${label}`;
}

/** „+12,3 mm nasser als November 2025“, „−12,3 mm trockener als …“, „gleich viel Niederschlag wie …“. */
export function precipitationDiffText(diff: number | null, label: string, digits = 1): string {
  if (diff === null) return `kein Vergleichswert für ${label}`;
  if (diff === 0) return `gleich viel Niederschlag wie ${label}`;
  return `${signed(diff, digits)} mm ${diff > 0 ? 'nasser' : 'trockener'} als ${label}`;
}

// ---------- Zustand des Vergleichs auf den Seiten Monat und Jahr ----------

/** Wert des Query-Parameters `?vergleich=vorjahr` (US19-7/-8: F5 behält den Vergleich). */
export const COMPARE_QUERY_VALUE = 'vorjahr';

/** `off` = nicht angefordert oder noch nicht bereit; `unavailable` = Vorjahr ohne Daten (404), kein Fehlerzustand. */
export type CompareState = 'off' | 'loading' | 'success' | 'unavailable' | 'error';

export interface CompareResult<T> {
  state: CompareState;
  data: T | null;
}

export const COMPARE_OFF: CompareResult<never> = { state: 'off', data: null };
export const COMPARE_LOADING: CompareResult<never> = { state: 'loading', data: null };

/** 404 (`NO_DATA`) → `unavailable` (Chip deaktiviert, R29); alles andere → `error`. */
export function compareFailure(err: { status?: number } | null): CompareResult<never> {
  return { state: err?.status === 404 ? 'unavailable' : 'error', data: null };
}

export const COMPARE_HINT_NONE = 'Noch kein vollständiger Tag zum Vergleichen';
export const COMPARE_HINT_UNAVAILABLE = 'Kein Vorjahr mit Daten';
export const COMPARE_HINT_LOADING = 'Vorjahr wird geladen …';
export const COMPARE_HINT_ERROR = 'Der Vorjahresvergleich konnte nicht geladen werden.';

/**
 * Text neben dem Schalter-Chip: Grund der Deaktivierung (immer), sonst nur bei aktivem Vergleich der Stand
 * („Vorjahr wird geladen …“, Fehler, „Verglichen mit 01.–18.11.2025“).
 */
export function compareHintText(
  plan: ComparePlan | null, previousYearMissing: boolean, requested: boolean, result: CompareResult<unknown>,
): string | null {
  if (!plan) return null;
  if (plan.kind === 'none') return COMPARE_HINT_NONE;
  if (previousYearMissing || result.state === 'unavailable') return COMPARE_HINT_UNAVAILABLE;
  if (!requested) return null;
  if (result.state === 'error') return COMPARE_HINT_ERROR;
  if (result.state === 'success') return `Verglichen mit ${plan.label}`;
  return COMPARE_HINT_LOADING;
}

/** `true`, wenn die Jahresliste geladen ist und das Vorjahr darin fehlt: Chip ohne Request deaktiviert (US19-8). */
export function isPreviousYearMissing(plan: ComparePlan | null, years: readonly { year: number }[] | null): boolean {
  return !!plan && !!years && !years.some(item => String(item.year) === plan.previousYear);
}
