import { ApiValidationException } from '../../common/api-validation.exception';
import { ImportCreateSchema, MAX_IMPORT_DAYS } from './import-create.schema';

function errorsOf(value: unknown) {
  const result = ImportCreateSchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('ImportCreateSchema (R18, US10-4/-6/-8)', () => {
  it('gültig: range, gaps, from = to, overwriteCorrections optional', () => {
    expect(ImportCreateSchema.parse({ kind: 'range', from: '2026-10-01', to: '2026-10-31' })).toEqual({
      kind: 'range',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(errorsOf({ kind: 'gaps', from: '2026-10-01', to: '2026-10-01' })).toEqual([]);
    expect(errorsOf({ kind: 'range', from: '1940-01-01', to: '1940-01-31', overwriteCorrections: true })).toEqual([]);
    expect(errorsOf({ kind: 'range', from: '2026-10-01', to: '2026-10-02', overwriteCorrections: false })).toEqual([]);
  });

  it(`genau ${MAX_IMPORT_DAYS} Tage (2023-01-01 bis 2025-12-31) gültig, 1097 Tage (bis 2026-01-01) → range_too_long an to`, () => {
    expect(errorsOf({ kind: 'range', from: '2023-01-01', to: '2025-12-31' })).toEqual([]);
    expect(errorsOf({ kind: 'range', from: '2023-01-01', to: '2026-01-01' })).toEqual([
      { field: 'to', code: 'range_too_long', message: 'Der Zeitraum darf höchstens 1096 Tage umfassen.' },
    ]);
  });

  it('US10-4: from nach to → to_before_from an to', () => {
    expect(errorsOf({ kind: 'range', from: '2026-10-31', to: '2026-10-01' })).toEqual([
      { field: 'to', code: 'to_before_from', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' },
    ]);
  });

  it.each(['scheduled', 'legacy', 'RANGE', undefined])('US10-8: kind %j → Fehler an kind', kind => {
    expect(errorsOf({ kind, from: '2026-10-01', to: '2026-10-03' })).toEqual([
      { field: 'kind', code: 'invalid_value', message: 'Erlaubt sind nur die Arten „range“ und „gaps“.' },
    ]);
  });

  it('Zusatzfeld "x": 1 → unrecognized_keys an x (Mass Assignment)', () => {
    expect(errorsOf({ kind: 'range', from: '2026-10-01', to: '2026-10-03', x: 1 })).toEqual([
      { field: 'x', code: 'unrecognized_keys', message: 'Das Feld „x“ ist nicht erlaubt.' },
    ]);
  });

  it('Format falsch → invalid_date am Feld; der Vergleich from/to entfällt dann', () => {
    expect(errorsOf({ kind: 'range', from: '2026-02-30', to: '2026-10-03' })).toEqual([
      { field: 'from', code: 'invalid_date', message: 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.' },
    ]);
    expect(errorsOf({ kind: 'range', from: '2026-10-01' })).toEqual([
      { field: 'to', code: 'invalid_type', message: 'Bitte ein Datum angeben.' },
    ]);
  });

  it('overwriteCorrections nur als boolean (kein "true" als Text)', () => {
    expect(errorsOf({ kind: 'range', from: '2026-10-01', to: '2026-10-03', overwriteCorrections: 'true' })).toEqual([
      { field: 'overwriteCorrections', code: 'invalid_type', message: 'overwriteCorrections muss true oder false sein.' },
    ]);
  });

  it('kein Objekt → Fehler am ganzen Body (field = null)', () => {
    expect(errorsOf('range')).toEqual([{ field: null, code: 'invalid_type', message: 'Der Body muss ein JSON-Objekt sein.' }]);
    expect(errorsOf(undefined)).toEqual([{ field: null, code: 'invalid_type', message: 'Der Body muss ein JSON-Objekt sein.' }]);
  });
});
