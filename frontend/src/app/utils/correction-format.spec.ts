import {
  CORRECTION_FIELDS, NOT_REVERSIBLE_MESSAGE, REASON_REQUIRED_MESSAGE, REASON_TOO_LONG_MESSAGE, REASON_TOO_SHORT_MESSAGE,
  formatCorrectionValue, hourLabel, inputValue, parseCorrectionValue, reasonError, reversibleCorrectionIds,
} from './correction-format';
import { correction, observation } from '../testing/admin-fixtures';

describe('correction-format (N03, R16, R33)', () => {
  it('sechs Felder nach R16 in der Reihenfolge des Formulars', () => {
    expect(CORRECTION_FIELDS.map(f => f.field)).toEqual([
      'temperature', 'apparentTemperature', 'precipitation', 'weatherCode', 'windSpeed', 'windDirection',
    ]);
  });

  it('parseCorrectionValue: leer = null, Komma oder Punkt, Grenzen und Nachkommastellen wie die API', () => {
    expect(parseCorrectionValue('temperature', '')).toEqual({ value: null, error: null });
    expect(parseCorrectionValue('temperature', ' 9,6 ')).toEqual({ value: 9.6, error: null });
    expect(parseCorrectionValue('temperature', '-50')).toEqual({ value: -50, error: null });
    expect(parseCorrectionValue('temperature', '−3,5').value).toBe(-3.5);
    expect(parseCorrectionValue('temperature', '51').error).toBe('Die Temperatur muss zwischen −50 und 50 °C liegen.');
    expect(parseCorrectionValue('temperature', '-50,1').error).toBe('Die Temperatur muss zwischen −50 und 50 °C liegen.');
    expect(parseCorrectionValue('temperature', '4,25').error).toBe('Höchstens eine Nachkommastelle.');
    expect(parseCorrectionValue('temperature', 'abc').error).toBe('Die Temperatur muss eine Zahl sein.');
    expect(parseCorrectionValue('precipitation', '-0,1').error).toBe('Der Niederschlag muss zwischen 0 und 200 mm liegen.');
    expect(parseCorrectionValue('windDirection', '361').error).toBe('Die Windrichtung muss zwischen 0 und 360° liegen.');
    expect(parseCorrectionValue('windDirection', '12,5').error).toBe('Die Windrichtung muss eine ganze Zahl sein.');
    expect(parseCorrectionValue('windSpeed', '300')).toEqual({ value: 300, error: null });
  });

  it('reasonError: Pflicht, 3 bis 500 Zeichen ohne Rand', () => {
    expect(reasonError('')).toBe(REASON_REQUIRED_MESSAGE);
    expect(reasonError('   ')).toBe(REASON_REQUIRED_MESSAGE);
    expect(reasonError(' ab ')).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(reasonError('abc')).toBeNull();
    expect(reasonError('x'.repeat(501))).toBe(REASON_TOO_LONG_MESSAGE);
  });

  it('Formate: Werte mit Einheit, Wettercode mit Text, null = unbekannt; Eingabe mit Komma', () => {
    expect(formatCorrectionValue('temperature', 9.6)).toBe('9,6 °C');
    expect(formatCorrectionValue('windDirection', 232)).toBe('232°');
    expect(formatCorrectionValue('temperature', 8)).toBe('8,0 °C');
    expect(formatCorrectionValue('windSpeed', 21.25)).toBe('21,25 km/h');
    expect(formatCorrectionValue('weatherCode', 61)).toBe('61 (Regen)');
    expect(formatCorrectionValue('precipitation', null)).toBe('unbekannt');
    expect(inputValue(19.6)).toBe('19,6');
    expect(inputValue(null)).toBe('');
    expect(hourLabel('2026-11-19T14:00:00+01:00')).toBe('14:00 Uhr');
    expect(hourLabel('2026-11-19T14:00')).toBe('14:00 Uhr');
  });

  it('reversibleCorrectionIds: jüngste nicht zurückgenommene Korrektur je Feld, keine Rücknahme selbst', () => {
    const current = observation({ temperature: 9.6, windSpeed: 30 });
    const items = [
      correction({ id: 5, field: 'windSpeed', oldValue: 21.3, newValue: 30, correctedAt: '2026-11-19T13:25:00Z' }),
      correction({ id: 4, field: 'temperature', oldValue: 12, newValue: 9.6, correctedAt: '2026-11-19T13:21:00Z' }),
      correction({ id: 3, field: 'temperature', oldValue: 19.6, newValue: 12, correctedAt: '2026-11-19T13:20:00Z' }),
    ];
    expect([...reversibleCorrectionIds(items, current)].sort()).toEqual([4, 5]);
  });

  it('nach einer Rücknahme ist die ältere Korrektur desselben Felds wieder rücknehmbar, die Rücknahme selbst nicht', () => {
    const current = observation({ temperature: 12 });
    const items = [
      correction({ id: 6, field: 'temperature', oldValue: 9.6, newValue: 12, revertsCorrectionId: 4, correctedAt: '2026-11-19T13:30:00Z' }),
      correction({ id: 4, field: 'temperature', oldValue: 12, newValue: 9.6, correctedAt: '2026-11-19T13:21:00Z' }),
      correction({ id: 3, field: 'temperature', oldValue: 19.6, newValue: 12, correctedAt: '2026-11-19T13:20:00Z' }),
    ];
    expect([...reversibleCorrectionIds(items, current)]).toEqual([3]);
  });

  it('Feld hat nicht mehr den korrigierten Wert (Import mit overwriteCorrections): nicht rücknehmbar', () => {
    const items = [correction({ id: 3, field: 'temperature', newValue: 9.6 })];
    expect(reversibleCorrectionIds(items, observation({ temperature: 11.2 })).size).toBe(0);
    expect(NOT_REVERSIBLE_MESSAGE).toContain('kann nicht zurückgenommen werden');
  });
});
