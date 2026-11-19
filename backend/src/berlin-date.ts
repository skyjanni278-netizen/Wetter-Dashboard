const TIMEZONE = 'Europe/Berlin';

/** Datum als YYYY-MM-DD in deutscher Zeit */
export function berlinDate(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}
