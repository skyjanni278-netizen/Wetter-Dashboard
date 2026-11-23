import {
  COMPARE_HINT_ERROR, COMPARE_HINT_LOADING, COMPARE_HINT_NONE, COMPARE_HINT_UNAVAILABLE, COMPARE_LOADING, COMPARE_OFF,
  compareFailure, compareHintText, isPreviousYearMissing, monthComparePlan, precipitationDiffText, previousYearDate,
  previousYearRange, rangeLabel, roundedDiff, temperatureDiffText, yearComparePlan,
} from './compare-period';

describe('compare-period (R29)', () => {
  describe('previousYearRange / previousYearDate', () => {
    it('Pflichtfall Roadmap: 2028-01-01..2028-02-29 → 2027-01-01..2027-02-28 (29.02. → 28.02.)', () => {
      expect(previousYearRange('2028-01-01', '2028-02-29')).toEqual({ from: '2027-01-01', to: '2027-02-28' });
    });

    it('gleiche Kalendertage ein Jahr früher (US19-9)', () => {
      expect(previousYearRange('2026-11-01', '2026-11-18')).toEqual({ from: '2025-11-01', to: '2025-11-18' });
    });

    it.each([
      ['2028-02-29', '2027-02-28'],
      ['2028-02-28', '2027-02-28'],
      ['2029-02-28', '2028-02-28'],
      ['2029-03-01', '2028-03-01'],
      ['2026-01-01', '2025-01-01'],
      ['2026-12-31', '2025-12-31'],
    ])('%s → %s', (date, expected) => {
      expect(previousYearDate(date)).toBe(expected);
    });

    it('ungültiges Datum wirft', () => {
      expect(() => previousYearDate('2026-13')).toThrow(RangeError);
    });
  });

  describe('monthComparePlan', () => {
    it('vollständiger Monat: gleicher Monat im Vorjahr über /summaries/months (kein Zeitraum)', () => {
      expect(monthComparePlan('2025', '03', '2026-11-19')).toEqual({
        kind: 'calendar', previousYear: '2024', previousId: '2024-03', label: 'März 2024',
      });
    });

    it('Monat endet gestern: vollständig', () => {
      expect(monthComparePlan('2026', '10', '2026-11-01')).toMatchObject({ kind: 'calendar', previousId: '2025-10' });
    });

    it('laufender Monat (US19-9, heute 19.11.2026): beide Seiten 01.–18.11., Text „01.–18.11.2025“', () => {
      expect(monthComparePlan('2026', '11', '2026-11-19')).toEqual({
        kind: 'period', previousYear: '2025',
        current: { from: '2026-11-01', to: '2026-11-18' },
        previous: { from: '2025-11-01', to: '2025-11-18' },
        label: '01.–18.11.2025',
      });
    });

    it('letzter Tag des Monats ist heute: noch unvollständig, bis gestern', () => {
      expect(monthComparePlan('2026', '11', '2026-11-30')).toMatchObject({
        kind: 'period', current: { from: '2026-11-01', to: '2026-11-29' },
      });
    });

    it('Schaltjahr: laufender Februar 2028 am 01.03. ist vollständig, am 29.02. bis 28.02.', () => {
      expect(monthComparePlan('2028', '02', '2028-03-01')).toMatchObject({ kind: 'calendar', previousId: '2027-02' });
      expect(monthComparePlan('2028', '02', '2028-02-29')).toMatchObject({
        kind: 'period', current: { from: '2028-02-01', to: '2028-02-28' }, previous: { from: '2027-02-01', to: '2027-02-28' },
      });
    });

    it('vollständiger Februar 2029 gegen den ganzen Februar 2028 (Monat minus 1); laufend am 28.02. bis 27.02.', () => {
      expect(monthComparePlan('2029', '02', '2029-03-01')).toMatchObject({ kind: 'calendar', previousId: '2028-02' });
      expect(monthComparePlan('2029', '02', '2029-02-28')).toMatchObject({
        kind: 'period', current: { from: '2029-02-01', to: '2029-02-27' }, previous: { from: '2028-02-01', to: '2028-02-27' },
      });
    });

    it('heute ist der 1.: kein vollständiger Tag zum Vergleichen', () => {
      expect(monthComparePlan('2026', '11', '2026-11-01')).toEqual({ kind: 'none', previousYear: '2025' });
    });

    it('Monat in der Zukunft: kein Vergleich', () => {
      expect(monthComparePlan('2026', '12', '2026-11-19').kind).toBe('none');
    });
  });

  describe('yearComparePlan', () => {
    it('vollständiges Jahr: Vorjahr über /summaries/years (US19-8: 2025 → 2024)', () => {
      expect(yearComparePlan('2025', '2026-11-19')).toEqual({
        kind: 'calendar', previousYear: '2024', previousId: '2024', label: '2024',
      });
    });

    it('laufendes Jahr (US19-7): 2026-01-01..2026-11-18 gegen 2025-01-01..2025-11-18', () => {
      expect(yearComparePlan('2026', '2026-11-19')).toEqual({
        kind: 'period', previousYear: '2025',
        current: { from: '2026-01-01', to: '2026-11-18' },
        previous: { from: '2025-01-01', to: '2025-11-18' },
        label: '01.01.–18.11.2025',
      });
    });

    it('Schaltjahr: laufendes 2028 am 01.03. → 2028-01-01..2028-02-29 gegen 2027-01-01..2027-02-28', () => {
      expect(yearComparePlan('2028', '2028-03-01')).toMatchObject({
        kind: 'period',
        current: { from: '2028-01-01', to: '2028-02-29' },
        previous: { from: '2027-01-01', to: '2027-02-28' },
        label: '01.01.–28.02.2027',
      });
    });

    it('31.12. ist heute: noch unvollständig; 01.01. des Folgejahres: vollständig', () => {
      expect(yearComparePlan('2026', '2026-12-31')).toMatchObject({ kind: 'period', current: { to: '2026-12-30' } });
      expect(yearComparePlan('2026', '2027-01-01')).toMatchObject({ kind: 'calendar', previousId: '2025' });
    });

    it('01.01. ist heute: kein Vergleich', () => {
      expect(yearComparePlan('2026', '2026-01-01').kind).toBe('none');
    });
  });

  describe('rangeLabel', () => {
    it.each([
      [{ from: '2025-11-01', to: '2025-11-18' }, '01.–18.11.2025'],
      [{ from: '2025-01-01', to: '2025-11-18' }, '01.01.–18.11.2025'],
      [{ from: '2025-11-01', to: '2025-11-01' }, '01.11.2025'],
      [{ from: '2025-12-30', to: '2026-01-02' }, '30.12.2025–02.01.2026'],
    ])('%o → %s', (range, expected) => {
      expect(rangeLabel(range)).toBe(expected);
    });
  });

  describe('roundedDiff (gerundet − gerundet)', () => {
    it('Differenz der angezeigten Werte, nicht der ungerundeten', () => {
      // angezeigt 10,3 und 9,8 → 0,5 (ungerundet wären es 0,4)
      expect(roundedDiff(10.25, 9.84)).toBe(0.5);
      expect(roundedDiff(9.84, 10.25)).toBe(-0.5);
    });

    it('ohne Gleitkomma-Reste', () => {
      expect(roundedDiff(0.3, 0.1)).toBe(0.2);
      expect(roundedDiff(11.6, 11.2)).toBe(0.4);
    });

    it('Nachkommastellen wie die Kennzahl (Jahresniederschlag ohne Nachkommastelle)', () => {
      expect(roundedDiff(701.6, 650.4, 0)).toBe(52);
    });

    it('negative Werte runden wie die Anzeige (halbe Stelle von null weg)', () => {
      expect(roundedDiff(-2.25, 0)).toBe(-2.3);
    });

    it('fehlender Wert → null', () => {
      expect(roundedDiff(null, 3)).toBeNull();
      expect(roundedDiff(3, null)).toBeNull();
      expect(roundedDiff(undefined, 3)).toBeNull();
    });
  });

  describe('Zustand neben dem Chip', () => {
    const period = yearComparePlan('2026', '2026-11-19');
    const calendar = yearComparePlan('2025', '2026-11-19');

    it('compareFailure: 404 → unavailable (kein Fehlerzustand), sonst error', () => {
      expect(compareFailure({ status: 404 }).state).toBe('unavailable');
      expect(compareFailure({ status: 500 }).state).toBe('error');
      expect(compareFailure({ status: 0 }).state).toBe('error');
      expect(compareFailure(null).state).toBe('error');
    });

    it('isPreviousYearMissing: nur mit geladener Jahresliste', () => {
      const years = [{ year: 2025 }, { year: 2026 }];
      expect(isPreviousYearMissing(calendar, years)).toBe(true);
      expect(isPreviousYearMissing(period, years)).toBe(false);
      expect(isPreviousYearMissing(calendar, null)).toBe(false);
      expect(isPreviousYearMissing(null, years)).toBe(false);
    });

    it('compareHintText: Grund der Deaktivierung immer, Stand nur bei aktivem Vergleich', () => {
      expect(compareHintText(null, false, true, COMPARE_OFF)).toBeNull();
      expect(compareHintText(yearComparePlan('2026', '2026-01-01'), false, false, COMPARE_OFF)).toBe(COMPARE_HINT_NONE);
      expect(compareHintText(calendar, true, false, COMPARE_OFF)).toBe(COMPARE_HINT_UNAVAILABLE);
      expect(compareHintText(period, false, true, { state: 'unavailable', data: null })).toBe(COMPARE_HINT_UNAVAILABLE);
      expect(compareHintText(period, false, false, COMPARE_OFF)).toBeNull();
      expect(compareHintText(period, false, true, COMPARE_OFF)).toBe(COMPARE_HINT_LOADING);
      expect(compareHintText(period, false, true, COMPARE_LOADING)).toBe(COMPARE_HINT_LOADING);
      expect(compareHintText(period, false, true, { state: 'error', data: null })).toBe(COMPARE_HINT_ERROR);
      expect(compareHintText(period, false, true, { state: 'success', data: {} })).toBe('Verglichen mit 01.01.–18.11.2025');
    });
  });

  describe('Differenztexte', () => {
    it('Temperatur: wärmer, kälter, gleich, ohne Wert', () => {
      expect(temperatureDiffText(0.4, '01.01.–18.11.2025')).toBe('+0,4 °C wärmer als 01.01.–18.11.2025');
      expect(temperatureDiffText(-1.2, 'November 2025')).toBe('−1,2 °C kälter als November 2025');
      expect(temperatureDiffText(0, '2025')).toBe('gleich warm wie 2025');
      expect(temperatureDiffText(null, '2025')).toBe('kein Vergleichswert für 2025');
    });

    it('Niederschlag: nasser, trockener, gleich; Nachkommastellen wie die Kennzahl', () => {
      expect(precipitationDiffText(12.3, '01.–18.11.2025')).toBe('+12,3 mm nasser als 01.–18.11.2025');
      expect(precipitationDiffText(-52, '2025', 0)).toBe('−52 mm trockener als 2025');
      expect(precipitationDiffText(0, '2025')).toBe('gleich viel Niederschlag wie 2025');
    });
  });
});
