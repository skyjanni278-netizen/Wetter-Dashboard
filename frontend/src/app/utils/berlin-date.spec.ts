import { berlinToday, berlinHour, addDays, isValidIsoDate } from './berlin-date';

describe('berlin-date', () => {
  describe('berlinToday', () => {
    it('Winterzeit: 23:30 UTC ist in Berlin schon der nächste Tag', () => {
      expect(berlinToday(new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20');
    });

    it('Winterzeit: 22:59 UTC ist in Berlin noch derselbe Tag', () => {
      expect(berlinToday(new Date('2026-11-19T22:59:00Z'))).toBe('2026-11-19');
    });

    it('Sommerzeit: 22:30 UTC ist in Berlin schon der nächste Tag (Monatswechsel)', () => {
      expect(berlinToday(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    });

    it('Sommerzeit: 21:59 UTC ist in Berlin noch derselbe Tag', () => {
      expect(berlinToday(new Date('2026-06-30T21:59:00Z'))).toBe('2026-06-30');
    });

    it('Jahreswechsel', () => {
      expect(berlinToday(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
    });

    it('ohne Argument liefert das Format YYYY-MM-DD', () => {
      expect(berlinToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('berlinHour', () => {
    it('Winterzeit: UTC + 1', () => {
      expect(berlinHour(new Date('2026-11-19T23:30:00Z'))).toBe(0);
      expect(berlinHour(new Date('2026-11-19T11:00:00Z'))).toBe(12);
    });

    it('Sommerzeit: UTC + 2', () => {
      expect(berlinHour(new Date('2026-06-30T22:30:00Z'))).toBe(0);
      expect(berlinHour(new Date('2026-06-30T21:59:00Z'))).toBe(23);
    });

    it('Mitternacht ergibt 0, nicht 24', () => {
      expect(berlinHour(new Date('2026-01-14T23:00:00Z'))).toBe(0);
    });

    it('Zeitumstellung 29.03.2026: 01:00 UTC ist 03:00 MESZ', () => {
      expect(berlinHour(new Date('2026-03-29T00:30:00Z'))).toBe(1);
      expect(berlinHour(new Date('2026-03-29T01:00:00Z'))).toBe(3);
    });
  });

  describe('addDays', () => {
    it('innerhalb eines Monats', () => {
      expect(addDays('2026-11-19', 1)).toBe('2026-11-20');
      expect(addDays('2026-11-19', -1)).toBe('2026-11-18');
      expect(addDays('2026-11-19', 0)).toBe('2026-11-19');
    });

    it('über die Monatsgrenze', () => {
      expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
      expect(addDays('2026-12-01', -1)).toBe('2026-11-30');
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('über die Jahresgrenze', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    });

    it('über die Zeitumstellung am 29.03.2026', () => {
      expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
      expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
      expect(addDays('2026-03-30', -1)).toBe('2026-03-29');
      expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
    });

    it('über die Zeitumstellung am 25.10.2026', () => {
      expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
      expect(addDays('2026-10-26', -1)).toBe('2026-10-25');
    });

    it('mehrere Tage', () => {
      expect(addDays('2026-11-19', 7)).toBe('2026-11-26');
      expect(addDays('2026-01-05', -10)).toBe('2025-12-26');
    });

    it('ungültiges Datum wirft RangeError', () => {
      expect(() => addDays('', 1)).toThrow(RangeError);
    });
  });

  describe('isValidIsoDate', () => {
    it('gültige Kalendertage, auch der 29.02. im Schaltjahr', () => {
      expect(isValidIsoDate('2026-11-19')).toBe(true);
      expect(isValidIsoDate('2028-02-29')).toBe(true);
      expect(isValidIsoDate('2025-01-01')).toBe(true);
    });

    it('ungültig: Format, Kalender, leer', () => {
      expect(isValidIsoDate('2026-02-30')).toBe(false);
      expect(isValidIsoDate('2027-02-29')).toBe(false);
      expect(isValidIsoDate('2026-13-01')).toBe(false);
      expect(isValidIsoDate('2026-04-31')).toBe(false);
      expect(isValidIsoDate('abc')).toBe(false);
      expect(isValidIsoDate('')).toBe(false);
      expect(isValidIsoDate(undefined)).toBe(false);
    });
  });
});
