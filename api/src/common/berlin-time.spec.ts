import {
  addDays,
  BERLIN_TIMEZONE,
  hoursInDay,
  isIsoDate,
  localDate,
  localDateTime,
  localHour,
} from './berlin-time';

describe('BerlinTime (C6)', () => {
  it('Zeitzone ist Europe/Berlin', () => {
    expect(BERLIN_TIMEZONE).toBe('Europe/Berlin');
  });

  describe('hoursInDay: Tage mit Zeitumstellung', () => {
    it.each([
      ['2025-03-30', 23],
      ['2025-10-26', 25],
      ['2026-03-29', 23],
      ['2026-10-25', 25],
    ])('%s hat %i Stunden', (date, hours) => {
      expect(hoursInDay(date)).toBe(hours);
    });

    it.each(['2025-03-29', '2025-03-31', '2025-10-25', '2025-10-27', '2026-11-10', '2026-07-19', '2024-02-29'])(
      '%s hat 24 Stunden',
      date => {
        expect(hoursInDay(date)).toBe(24);
      },
    );

    it.each(['2026-02-30', '2026-11-1', 'heute', ''])('wirft bei ungültigem Datum "%s"', date => {
      expect(() => hoursInDay(date)).toThrow(RangeError);
    });
  });

  describe('localDate: Mitternacht MEZ (UTC+1)', () => {
    it('2026-11-19T23:30Z ist in Berlin schon der 20.11. (00:30 MEZ, F06)', () => {
      expect(localDate(new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20');
      expect(localHour(new Date('2026-11-19T23:30:00Z'))).toBe(0);
    });

    it('2026-11-19T22:59Z ist in Berlin noch der 19.11. (23:59 MEZ)', () => {
      expect(localDate(new Date('2026-11-19T22:59:59Z'))).toBe('2026-11-19');
      expect(localHour(new Date('2026-11-19T22:59:59Z'))).toBe(23);
    });

    it('2026-11-19T23:00Z ist genau 00:00 MEZ am 20.11.', () => {
      expect(localDate(new Date('2026-11-19T23:00:00Z'))).toBe('2026-11-20');
    });

    it('Jahreswechsel: 2025-12-31T23:30Z ist der 01.01.2026', () => {
      expect(localDate(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    });
  });

  describe('localDate: Mitternacht MESZ (UTC+2)', () => {
    it('2026-07-19T22:30Z ist in Berlin schon der 20.07. (00:30 MESZ)', () => {
      expect(localDate(new Date('2026-07-19T22:30:00Z'))).toBe('2026-07-20');
      expect(localHour(new Date('2026-07-19T22:30:00Z'))).toBe(0);
    });

    it('2026-07-19T21:59Z ist in Berlin noch der 19.07. (23:59 MESZ)', () => {
      expect(localDate(new Date('2026-07-19T21:59:59Z'))).toBe('2026-07-19');
      expect(localHour(new Date('2026-07-19T21:59:59Z'))).toBe(23);
    });

    it('2026-07-19T22:30Z wäre in UTC noch der 19.07. (Server-Zeitzone spielt keine Rolle)', () => {
      expect(new Date('2026-07-19T22:30:00Z').toISOString().slice(0, 10)).toBe('2026-07-19');
    });
  });

  describe('localHour an Tagen mit Zeitumstellung', () => {
    it('29.03.2026: nach 01:59 MEZ folgt 03:00 MESZ', () => {
      expect(localHour(new Date('2026-03-29T00:59:00Z'))).toBe(1);
      expect(localHour(new Date('2026-03-29T01:00:00Z'))).toBe(3);
    });

    it('25.10.2026: 02:00 Ortszeit kommt zweimal vor (MESZ, dann MEZ)', () => {
      expect(localHour(new Date('2026-10-25T00:30:00Z'))).toBe(2);
      expect(localHour(new Date('2026-10-25T01:30:00Z'))).toBe(2);
      expect(localDate(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
    });

    it('30.03.2025 und 26.10.2025: Zeitumstellung um 01:00 UTC', () => {
      expect(localHour(new Date('2025-03-30T00:59:00Z'))).toBe(1);
      expect(localHour(new Date('2025-03-30T01:00:00Z'))).toBe(3);
      expect(localHour(new Date('2025-10-26T00:30:00Z'))).toBe(2);
      expect(localHour(new Date('2025-10-26T01:30:00Z'))).toBe(2);
    });
  });

  describe('localDateTime', () => {
    it('liefert die Ortszeit ohne Offset (MEZ und MESZ)', () => {
      expect(localDateTime(new Date('2026-11-19T23:00:00Z'))).toBe('2026-11-20T00:00');
      expect(localDateTime(new Date('2026-09-30T22:00:00Z'))).toBe('2026-10-01T00:00');
    });

    it('25.10.2026: 00:00Z und 01:00Z sind beide 02:00 Ortszeit', () => {
      expect(localDateTime(new Date('2026-10-25T00:00:00Z'))).toBe('2026-10-25T02:00');
      expect(localDateTime(new Date('2026-10-25T01:00:00Z'))).toBe('2026-10-25T02:00');
    });
  });

  describe('addDays', () => {
    it.each([
      ['2026-10-01', -1, '2026-09-30'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2024-02-28', 1, '2024-02-29'],
      ['2026-03-29', 1, '2026-03-30'],
      ['2026-11-20', -10, '2026-11-10'],
    ])('%s %+i → %s', (date, days, expected) => {
      expect(addDays(date, days)).toBe(expected);
    });

    it('wirft bei ungültigem Datum', () => {
      expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    });
  });

  describe('isIsoDate', () => {
    it.each(['2026-11-10', '2024-02-29'])('%s ist gültig', date => {
      expect(isIsoDate(date)).toBe(true);
    });

    it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-11-1', '2026-11-10T00:00', 'today'])(
      '%s ist ungültig',
      date => {
        expect(isIsoDate(date)).toBe(false);
      },
    );
  });
});
