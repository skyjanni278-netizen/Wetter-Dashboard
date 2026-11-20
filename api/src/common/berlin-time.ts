/**
 * Kalenderrechnung in Europe/Berlin (C6). Ein „Tag“ ist immer der Berliner Kalendertag,
 * unabhängig von der Zeitzone des Servers. Alle Funktionen sind rein (ohne `new Date()`);
 * den Zeitpunkt liefert der Aufrufer, in der Anwendung über die `Clock`.
 */
export const BERLIN_TIMEZONE = 'Europe/Berlin';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: BERLIN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(instant: Date): LocalParts {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Ungültiger Zeitpunkt');
  }
  const values: Record<string, number> = {};
  for (const part of PARTS_FORMAT.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values['year'],
    month: values['month'],
    day: values['day'],
    hour: values['hour'],
    minute: values['minute'],
    second: values['second'],
  };
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** Prüft `YYYY-MM-DD` auf Format und echten Kalendertag (kein 30.02.). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(0);
  check.setUTCFullYear(y, m - 1, d);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** Berliner Kalendertag eines Zeitpunkts als `YYYY-MM-DD`. */
export function localDate(instant: Date): string {
  const p = localParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

/** Berliner Stunde eines Zeitpunkts (0–23). */
export function localHour(instant: Date): number {
  return localParts(instant).hour;
}

/** Abstand Berlin zu UTC in Millisekunden zum gegebenen Zeitpunkt (+1 h MEZ, +2 h MESZ). */
function offsetMs(instant: number): number {
  const p = localParts(new Date(instant));
  const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}

/** UTC-Zeitpunkt von 00:00 Uhr Berliner Zeit am gegebenen Tag. */
function startOfLocalDay(year: number, month: number, day: number): number {
  const wallClock = Date.UTC(year, month - 1, day);
  // Zwei Durchläufe: Der erste Versatz ist eine Schätzung, der zweite gilt am Zielzeitpunkt.
  // Um Mitternacht gibt es in Berlin keine Zeitumstellung, das Ergebnis ist daher eindeutig.
  const guess = wallClock - offsetMs(wallClock);
  return wallClock - offsetMs(guess);
}

/**
 * Anzahl der Stunden eines Berliner Kalendertags: 23 (Beginn der Sommerzeit),
 * 25 (Ende der Sommerzeit), sonst 24.
 */
export function hoursInDay(date: string): number {
  const match = ISO_DATE.exec(date);
  if (!match || !isIsoDate(date)) {
    throw new RangeError(`Ungültiges Datum: "${date}"`);
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = startOfLocalDay(y, m, d);
  const end = startOfLocalDay(y, m, d + 1);
  return Math.round((end - start) / HOUR_MS);
}
