import { ApiValidationException } from '../../common/api-validation.exception';
import { GapsQuerySchema, MAX_GAP_DAYS } from './gaps-query.schema';

function errorsOf(value: unknown) {
  const result = GapsQuerySchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('GapsQuerySchema (US12-1/-2, Muster R23)', () => {
  it('US12-1: gültiger Zeitraum; Grenze 1096 Tage (wie ein Import, R18)', () => {
    expect(GapsQuerySchema.parse({ from: '2026-11-01', to: '2026-11-19' })).toEqual({ from: '2026-11-01', to: '2026-11-19' });
    expect(MAX_GAP_DAYS).toBe(1096);
    expect(errorsOf({ from: '2025-01-01', to: '2026-11-19' })).toEqual([]); // US17-2: Datenbeginn bis heute
    expect(errorsOf({ from: '2024-01-01', to: '2026-12-31' })).toEqual([]); // genau 1096 Tage
  });

  it('US12-2: from > to → to_before_from am Feld to', () => {
    expect(errorsOf({ from: '2026-11-19', to: '2026-11-01' })).toEqual([
      { field: 'to', code: 'to_before_from', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' },
    ]);
  });

  it('1097 Tage → range_too_long; ungültiger Kalendertag → invalid_date; unbekannter Parameter → unrecognized_keys', () => {
    expect(errorsOf({ from: '2024-01-01', to: '2027-01-01' })).toEqual([expect.objectContaining({ field: 'to', code: 'range_too_long' })]);
    expect(errorsOf({ from: '2026-02-30', to: '2026-03-01' })).toEqual([expect.objectContaining({ field: 'from', code: 'invalid_date' })]);
    expect(errorsOf({ from: '2026-11-01', to: '2026-11-02', reason: 'missing' })).toEqual([
      expect.objectContaining({ field: 'reason', code: 'unrecognized_keys' }),
    ]);
    expect(errorsOf({ from: '2026-11-01' }).map(e => [e.field, e.code])).toEqual([['to', 'invalid_type']]);
  });
});
