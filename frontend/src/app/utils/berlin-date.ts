/**
 * Datums- und Stundenhelfer für die Zeitzone Europe/Berlin (V09, F06).
 * „Tag" ist immer der Kalendertag in Berlin, unabhängig von der Zeitzone des Browsers.
 */

const TIMEZONE = 'Europe/Berlin';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HOUR_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find(p => p.type === type)?.value ?? '';
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** Heutiges Datum in Berlin als YYYY-MM-DD */
export function berlinToday(now: Date = new Date()): string {
  const parts = DATE_FORMAT.formatToParts(now);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

/** Aktuelle Stunde in Berlin (0–23) */
export function berlinHour(now: Date = new Date()): number {
  return parseInt(part(HOUR_FORMAT.formatToParts(now), 'hour'), 10);
}

/**
 * Addiert Kalendertage zu einem Datum YYYY-MM-DD.
 * Reine Kalenderrechnung (UTC intern), daher ohne Einfluss von Zeitzone oder Zeitumstellung.
 */
export function addDays(date: string, days: number): string {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Ungültiges Datum: "${date}"`);
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** Prüft YYYY-MM-DD auf Format und Kalender: „2026-02-30“ und „abc“ sind ungültig. */
export function isValidIsoDate(date: string | null | undefined): boolean {
  const match = ISO_DATE.exec(date ?? '');
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(0);
  check.setUTCFullYear(y, m - 1, d);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** YYYY-MM-DD als „Donnerstag, 19. November 2026“; ungültige Werte bleiben unverändert. */
export function formatDateLongDe(date: string): string {
  if (!isValidIsoDate(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  return LONG_DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
}

/** YYYY-MM-DD als TT.MM.JJJJ */
export function formatDateDe(date: string): string {
  const match = ISO_DATE.exec(date);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}
