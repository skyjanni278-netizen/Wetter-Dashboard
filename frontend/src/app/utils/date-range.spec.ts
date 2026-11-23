import {
  FROM_REQUIRED_MESSAGE, INVALID_DATE_MESSAGE, RANGE_TOO_LONG_MESSAGE, TO_BEFORE_FROM_MESSAGE, TO_REQUIRED_MESSAGE,
  hasDateRangeErrors, rangeTooLongMessage, toInFutureMessage, validateDateRange,
} from './date-range';

describe('validateDateRange (R18, US10-4/-5/-6, US12-2)', () => {
  it('gültig: from = to, from < to, bis heute', () => {
    expect(validateDateRange('2026-10-01', '2026-10-01')).toEqual({});
    expect(validateDateRange('2026-10-01', '2026-10-31', '2026-11-22')).toEqual({});
    expect(validateDateRange('2026-11-16', '2026-11-22', '2026-11-22')).toEqual({});
  });

  it('leere Felder → Pflichtmeldung je Feld', () => {
    expect(validateDateRange('', '')).toEqual({ from: FROM_REQUIRED_MESSAGE, to: TO_REQUIRED_MESSAGE });
  });

  it('kein Kalendertag → Formatmeldung am Feld, kein Vergleich', () => {
    expect(validateDateRange('2026-02-30', '2026-01-01')).toEqual({ from: INVALID_DATE_MESSAGE });
  });

  it('US10-4: Bis vor Von → Fehler am Feld „Bis“ (to), gleicher Text wie die API', () => {
    expect(validateDateRange('2026-10-31', '2026-10-01')).toEqual({ to: TO_BEFORE_FROM_MESSAGE });
    expect(TO_BEFORE_FROM_MESSAGE).toBe('Das Enddatum darf nicht vor dem Startdatum liegen.');
  });

  it('US10-6: 1096 Tage gültig, 1097 Tage → range_too_long an „Bis“', () => {
    expect(validateDateRange('2023-01-01', '2025-12-31')).toEqual({});
    expect(validateDateRange('2023-01-01', '2026-01-01')).toEqual({ to: RANGE_TOO_LONG_MESSAGE });
  });

  it('US10-5: Bis nach heute (laut Server) → Fehler an „Bis“; ohne heute keine Prüfung', () => {
    expect(validateDateRange('2026-11-01', '2026-11-23', '2026-11-22')).toEqual({ to: toInFutureMessage('2026-11-22') });
    expect(toInFutureMessage('2026-11-22')).toBe('Das Enddatum darf nicht nach heute (22.11.2026) liegen.');
    expect(validateDateRange('2026-11-01', '2026-11-23', null)).toEqual({});
  });

  it('eigene Höchstspanne (Korrekturen: 366 Tage, R23)', () => {
    expect(validateDateRange('2025-11-20', '2026-11-20', null, 366)).toEqual({});
    expect(validateDateRange('2025-11-19', '2026-11-20', null, 366)).toEqual({ to: rangeTooLongMessage(366) });
    expect(rangeTooLongMessage(366)).toBe('Der Zeitraum darf höchstens 366 Tage umfassen.');
  });

  it('hasDateRangeErrors', () => {
    expect(hasDateRangeErrors({})).toBe(false);
    expect(hasDateRangeErrors({ to: 'x' })).toBe(true);
  });
});
