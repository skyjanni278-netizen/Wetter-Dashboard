import { ApiValidationException } from '../../common/api-validation.exception';
import { ObservationPatchSchema } from './observation-patch.schema';
import { ReversalSchema } from './reversal.schema';
import { CorrectionParamSchema } from './correction-param.schema';

function errorsOf(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error as never).errors;
}

const REASON = 'Ausreißer, Nachbarstunden 9,4/9,8 °C';
const patchErrors = (value: unknown) => errorsOf(ObservationPatchSchema, value);

describe('ObservationPatchSchema (PATCH /api/observations/:id, R16, US13-2/-5/-6/-7)', () => {
  it('US13-2: { temperature: 9.6, reason } ist gültig; reason wird getrimmt', () => {
    expect(ObservationPatchSchema.parse({ temperature: 9.6, reason: `  ${REASON} ` })).toEqual({ temperature: 9.6, reason: REASON });
  });

  it.each([
    ['temperature', -50],
    ['temperature', 50],
    ['apparentTemperature', -70],
    ['apparentTemperature', 60],
    ['precipitation', 0],
    ['precipitation', 200],
    ['windSpeed', 0],
    ['windSpeed', 300],
    ['windDirection', 0],
    ['windDirection', 360],
    ['weatherCode', 0],
    ['weatherCode', 99],
  ])('Grenze %s = %s ist gültig', (field, value) => {
    expect(patchErrors({ [field]: value, reason: REASON })).toEqual([]);
  });

  it('null setzt einen Wert auf „unbekannt“ (R14) und ist gültig', () => {
    expect(ObservationPatchSchema.parse({ windDirection: null, reason: REASON })).toEqual({ windDirection: null, reason: REASON });
  });

  it.each([
    ['temperature', -50.1, 'too_small'],
    ['temperature', 51, 'too_big'],
    ['apparentTemperature', 60.1, 'too_big'],
    ['precipitation', -0.1, 'too_small'],
    ['windSpeed', 300.1, 'too_big'],
    ['windDirection', 361, 'too_big'],
    ['windDirection', 12.5, 'invalid_type'],
    ['temperature', '9,6', 'invalid_type'],
    ['temperature', 4.25, 'not_multiple_of'],
    ['weatherCode', 4, 'invalid_value'],
    ['weatherCode', 61.5, 'invalid_type'],
  ])('%s = %j → 400 an diesem Feld (%s)', (field, value, code) => {
    expect(patchErrors({ [field]: value, reason: REASON })[0]).toMatchObject({ field, code });
  });

  it('US13-5: { temperature: 51 } → errors[0] am Feld temperature mit deutscher Meldung', () => {
    expect(patchErrors({ temperature: 51, reason: REASON })).toEqual([
      { field: 'temperature', code: 'too_big', message: 'Die Temperatur muss zwischen −50 und 50 °C liegen.' },
    ]);
  });

  it('US13-6: source → unrecognized_keys je Schlüssel; ebenso timeUtc, id, version', () => {
    expect(patchErrors({ temperature: 9.6, source: 'archive', reason: REASON })[0]).toEqual({
      field: 'source',
      code: 'unrecognized_keys',
      message: 'Das Feld „source“ ist nicht erlaubt.',
    });
    expect(patchErrors({ temperature: 9.6, timeUtc: 'x', id: 1, version: 3, reason: REASON }).map(e => e.field)).toEqual([
      'timeUtc',
      'id',
      'version',
    ]);
  });

  it('US13-7: nur reason → errors[0] = { field: null, code: "missing_measurement" }', () => {
    expect(patchErrors({ reason: 'nur Begründung' })).toEqual([
      { field: null, code: 'missing_measurement', message: 'Bitte mindestens einen Messwert angeben.' },
    ]);
  });

  it('leeres Objekt, kein Objekt, reason fehlt/zu kurz/zu lang → 400', () => {
    expect(patchErrors({})[0]).toMatchObject({ field: 'reason', code: 'invalid_type' });
    expect(patchErrors([])[0]).toMatchObject({ field: null, code: 'invalid_type' });
    expect(patchErrors({ temperature: 9.6 })[0]).toMatchObject({ field: 'reason', code: 'invalid_type' });
    expect(patchErrors({ temperature: 9.6, reason: '  ab  ' })[0]).toMatchObject({ field: 'reason', code: 'too_small' });
    expect(patchErrors({ temperature: 9.6, reason: 'x'.repeat(501) })[0]).toMatchObject({ field: 'reason', code: 'too_big' });
    expect(patchErrors({ temperature: 9.6, reason: 'x'.repeat(500) })).toEqual([]);
  });
});

describe('ReversalSchema (R33, US13-16/-18)', () => {
  it('{ reason } ist gültig; ohne reason oder mit Zusatzfeld → 400', () => {
    expect(ReversalSchema.parse({ reason: 'Rücknahme: Wert war plausibel' })).toEqual({ reason: 'Rücknahme: Wert war plausibel' });
    expect(errorsOf(ReversalSchema, {})[0]).toMatchObject({ field: 'reason', code: 'invalid_type' });
    expect(errorsOf(ReversalSchema, { reason: 'gut genug', temperature: 1 })[0]).toMatchObject({
      field: 'temperature',
      code: 'unrecognized_keys',
    });
  });
});

describe('CorrectionParamSchema', () => {
  it('beide IDs wie IdParamSchema (positive ganze Zahl) → number', () => {
    expect(CorrectionParamSchema.parse({ id: '16503', correctionId: '3' })).toEqual({ id: 16503, correctionId: 3 });
    expect(errorsOf(CorrectionParamSchema, { id: '16503', correctionId: '0' })[0]).toMatchObject({ field: 'correctionId' });
    expect(errorsOf(CorrectionParamSchema, { id: '-1', correctionId: '3' })[0]).toMatchObject({ field: 'id' });
  });
});
