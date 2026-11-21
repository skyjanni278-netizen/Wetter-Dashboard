import { localDateTimeWithOffset, startOfDayUtc, utcOffsetMinutes } from './berlin-time';

/** Ergänzungen von Schritt 9: Offset für `utc_offset_min`, Tagesbeginn in UTC, Ortszeit mit Offset (Gaps). */
describe('BerlinTime: Offset und Tagesbeginn (Schritt 9)', () => {
  it.each([
    ['2026-11-19T13:00:00Z', 60, '2026-11-19T14:00:00+01:00'],
    ['2026-07-02T14:00:00Z', 120, '2026-07-02T16:00:00+02:00'],
    // Ende der Sommerzeit: 02:00 gibt es zweimal, der Offset unterscheidet sie.
    ['2026-10-25T00:00:00Z', 120, '2026-10-25T02:00:00+02:00'],
    ['2026-10-25T01:00:00Z', 60, '2026-10-25T02:00:00+01:00'],
    // Beginn der Sommerzeit: auf 01:59 MEZ folgt 03:00 MESZ.
    ['2026-03-29T00:59:00Z', 60, '2026-03-29T01:59:00+01:00'],
    ['2026-03-29T01:00:00Z', 120, '2026-03-29T03:00:00+02:00'],
  ])('%s → %i min, %s', (utc, offset, local) => {
    expect(utcOffsetMinutes(new Date(utc))).toBe(offset);
    expect(localDateTimeWithOffset(new Date(utc))).toBe(local);
  });

  it.each([
    ['2026-11-19', '2026-11-18T23:00:00.000Z'],
    ['2026-07-02', '2026-07-01T22:00:00.000Z'],
    ['2026-03-29', '2026-03-28T23:00:00.000Z'],
    ['2026-10-25', '2026-10-24T22:00:00.000Z'],
  ])('startOfDayUtc(%s) = %s', (date, utc) => {
    expect(startOfDayUtc(date).toISOString()).toBe(utc);
  });

  it('ungültige Eingaben → RangeError', () => {
    expect(() => startOfDayUtc('2026-02-30')).toThrow(RangeError);
    expect(() => utcOffsetMinutes(new Date('x'))).toThrow(RangeError);
  });
});
