import { LEGACY_TIME_RULE, legacyTimeToUtc } from './legacy-time';

describe('legacyTimeToUtc (03 Z1, B2.7 Schritt 5)', () => {
  it('die Regel des Altdatenimports ist fixed+01:00 (DST-Stichprobe 22.11.2026)', () => {
    expect(LEGACY_TIME_RULE).toBe('fixed+01:00');
  });

  it.each([
    ['2025-01-01T00:00', '2024-12-31T23:00:00Z'],
    ['2025-07-15T14:00', '2025-07-15T13:00:00Z'],
    ['2026-03-29T02:00', '2026-03-29T01:00:00Z'],
    ['2025-10-26T02:00', '2025-10-26T01:00:00Z'],
  ])('fixed+01:00: %s → %s (auch im Sommer und an DST-Tagen)', (time, utc) => {
    expect(legacyTimeToUtc(time, 'fixed+01:00')).toBe(utc);
  });

  it.each([
    ['2025-01-01T00:00', '2024-12-31T23:00:00Z'],
    ['2025-07-15T14:00', '2025-07-15T12:00:00Z'],
    ['2025-10-26T02:00', '2025-10-26T00:00:00Z'],
    ['2025-10-26T03:00', '2025-10-26T02:00:00Z'],
  ])('europe-berlin: %s → %s (doppelte 02:00 im Oktober = MESZ)', (time, utc) => {
    expect(legacyTimeToUtc(time, 'europe-berlin')).toBe(utc);
  });

  it('europe-berlin: 02:00 am Beginn der Sommerzeit gibt es nicht → null', () => {
    expect(legacyTimeToUtc('2026-03-29T02:00', 'europe-berlin')).toBeNull();
  });

  it('kein Format YYYY-MM-DDTHH:00 → null', () => {
    expect(legacyTimeToUtc('2025-07-15 14:00')).toBeNull();
    expect(legacyTimeToUtc('2025-07-15T14:30')).toBeNull();
  });
});
