import { dayParamStatus, isValidMonthParam, isValidYearParam } from './route-params';

describe('route-params (V08)', () => {
  const today = '2026-11-19';

  describe('dayParamStatus', () => {
    it('gültige Tage', () => {
      expect(dayParamStatus('2026-11-10', today)).toBe('valid');
      expect(dayParamStatus('2026-11-19', today)).toBe('valid');
      expect(dayParamStatus('2025-01-01', today)).toBe('valid');
      expect(dayParamStatus('2028-02-29', '2028-03-01')).toBe('valid');
    });

    it('syntaktisch oder kalendarisch ungültig', () => {
      for (const date of ['2026-02-30', 'abc', '', '2026-13-01', '2026-00-10', '2026-11-1', '2027-02-29', '2026-11-10x']) {
        expect(dayParamStatus(date, today)).toBe('invalid');
      }
    });

    it('Zukunft', () => {
      expect(dayParamStatus('2026-11-20', today)).toBe('future');
      expect(dayParamStatus('2030-01-01', today)).toBe('future');
    });

    it('vor DATA_START', () => {
      expect(dayParamStatus('2024-12-31', today)).toBe('before-start');
      expect(dayParamStatus('1999-05-05', today)).toBe('before-start');
    });
  });

  it('Jahr: von 2025 bis zum aktuellen Jahr, vierstellig', () => {
    expect(isValidYearParam('2025', today)).toBe(true);
    expect(isValidYearParam('2026', today)).toBe(true);
    expect(isValidYearParam('1999', today)).toBe(false);
    expect(isValidYearParam('2024', today)).toBe(false);
    expect(isValidYearParam('2027', today)).toBe(false);
    expect(isValidYearParam('abc', today)).toBe(false);
    expect(isValidYearParam('20250', today)).toBe(false);
    expect(isValidYearParam(undefined, today)).toBe(false);
  });

  it('Monat: 01 bis 12, zweistellig', () => {
    expect(isValidMonthParam('01')).toBe(true);
    expect(isValidMonthParam('12')).toBe(true);
    expect(isValidMonthParam('13')).toBe(false);
    expect(isValidMonthParam('00')).toBe(false);
    expect(isValidMonthParam('3')).toBe(false);
    expect(isValidMonthParam('ab')).toBe(false);
    expect(isValidMonthParam(null)).toBe(false);
  });
});
