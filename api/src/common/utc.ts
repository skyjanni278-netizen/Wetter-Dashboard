/** Zeitpunkt als UTC-Text `YYYY-MM-DDTHH:MM:SSZ` (Format aus 03 B2.2, ohne Millisekunden). */
export function formatUtc(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Ungültiger Zeitpunkt');
  }
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
