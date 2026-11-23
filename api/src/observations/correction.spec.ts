import { CORRECTION_COLUMNS, fieldOfColumn, hasEffectiveCorrection, notReversibleReason } from './correction';
import type { CorrectionRow } from './correction';
import type { ObservationValues } from './observation';

function entry(id: number, field: CorrectionRow['field'], oldValue: number | null, newValue: number | null, reverts: number | null = null): CorrectionRow {
  return {
    id,
    observation_id: 1,
    field,
    old_value: oldValue,
    new_value: newValue,
    reason: 'Grund',
    corrected_by: 1,
    corrected_at: '2026-11-19T13:20:00Z',
    reverts_correction_id: reverts,
  };
}

const values = (v: Partial<ObservationValues>): ObservationValues => ({
  temperature: 9.6,
  apparentTemperature: 5.1,
  precipitation: 0.4,
  weatherCode: 61,
  windSpeed: 21.3,
  windDirection: 232,
  ...v,
});

describe('Korrekturfelder (03 B2.2: API camelCase, DB snake_case)', () => {
  it('jede Spalte hat genau ein API-Feld und zurück', () => {
    for (const [field, column] of Object.entries(CORRECTION_COLUMNS)) expect(fieldOfColumn(column)).toBe(field);
    expect(CORRECTION_COLUMNS.apparentTemperature).toBe('apparent_temperature');
  });
});

describe('R33: notReversibleReason und hasEffectiveCorrection', () => {
  const first = entry(3, 'temperature', 19.6, 9.6);

  it('jüngste wirksame Korrektur → rücknehmbar; danach keine wirksame mehr', () => {
    expect(notReversibleReason(first, [first], values({}))).toBeNull();
    expect(hasEffectiveCorrection([first], values({}))).toBe(true);
    const reversal = entry(4, 'temperature', 9.6, 19.6, 3);
    expect(hasEffectiveCorrection([first, reversal], values({ temperature: 19.6 }))).toBe(false);
  });

  it('schon zurückgenommen / selbst eine Rücknahme / nicht die jüngste des Felds / Wert ersetzt', () => {
    const reversal = entry(4, 'temperature', 9.6, 19.6, 3);
    expect(notReversibleReason(first, [first, reversal], values({ temperature: 19.6 }))).toMatch(/schon zurückgenommen/);
    expect(notReversibleReason(reversal, [first, reversal], values({ temperature: 19.6 }))).toMatch(/selbst eine Rücknahme/);
    const later = entry(5, 'temperature', 9.6, 8);
    expect(notReversibleReason(first, [first, later], values({ temperature: 8 }))).toMatch(/noch einmal korrigiert/);
    expect(notReversibleReason(first, [first], values({ temperature: 4.2 }))).toMatch(/Import/);
  });

  it('eine spätere Korrektur eines anderen Felds hindert nicht; die Stunde bleibt korrigiert', () => {
    const wind = entry(5, 'wind_direction', 232, 180);
    expect(notReversibleReason(first, [first, wind], values({ windDirection: 180 }))).toBeNull();
    const reversal = entry(6, 'temperature', 9.6, 19.6, 3);
    expect(hasEffectiveCorrection([first, wind, reversal], values({ temperature: 19.6, windDirection: 180 }))).toBe(true);
  });

  it('jüngere Korrektur zurückgenommen → die ältere ist wieder die jüngste und wirksam', () => {
    const later = entry(5, 'temperature', 9.6, 8);
    const reversal = entry(6, 'temperature', 8, 9.6, 5);
    expect(notReversibleReason(first, [first, later, reversal], values({ temperature: 9.6 }))).toBeNull();
    expect(hasEffectiveCorrection([first, later, reversal], values({ temperature: 9.6 }))).toBe(true);
  });

  it('null als neuer Wert wird wie ein Wert verglichen', () => {
    const toNull = entry(7, 'wind_speed', 21.3, null);
    expect(notReversibleReason(toNull, [toNull], values({ windSpeed: null }))).toBeNull();
    expect(hasEffectiveCorrection([toNull], values({ windSpeed: 3 }))).toBe(false);
  });
});
