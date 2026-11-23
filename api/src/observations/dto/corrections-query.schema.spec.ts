import { ApiValidationException } from '../../common/api-validation.exception';
import { CorrectionsQuerySchema } from './corrections-query.schema';

function errorsOf(value: unknown) {
  const result = CorrectionsQuerySchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('CorrectionsQuerySchema (GET /api/corrections, R23, R24, US13-14/-15)', () => {
  it('US13-14: from=to, page und limit als Text → Zahlen; Standard page 1, limit 20', () => {
    expect(CorrectionsQuerySchema.parse({ from: '2026-11-19', to: '2026-11-19', page: '1', limit: '20' })).toEqual({
      from: '2026-11-19',
      to: '2026-11-19',
      page: 1,
      limit: 20,
    });
    expect(CorrectionsQuerySchema.parse({ from: '2026-11-01', to: '2026-11-19' })).toMatchObject({ page: 1, limit: 20 });
  });

  it('US13-15: to vor from → errors[0] = { field: "to", code: "to_before_from" }', () => {
    expect(errorsOf({ from: '2026-11-19', to: '2026-11-01' })[0]).toMatchObject({ field: 'to', code: 'to_before_from' });
  });

  it('US13-15 / R24: limit=101, limit=0, page=0 → 400 am Feld; limit=1 und 100 gültig', () => {
    const base = { from: '2026-11-01', to: '2026-11-19' };
    expect(errorsOf({ ...base, limit: '101' })[0]).toMatchObject({ field: 'limit', code: 'too_big' });
    expect(errorsOf({ ...base, limit: '0' })[0]).toMatchObject({ field: 'limit', code: 'too_small' });
    expect(errorsOf({ ...base, page: '0' })[0]).toMatchObject({ field: 'page', code: 'too_small' });
    expect(errorsOf({ ...base, limit: '1' })).toEqual([]);
    expect(errorsOf({ ...base, limit: '100' })).toEqual([]);
  });

  it('R23: from/to Pflicht, Kalendertag, höchstens 366 Tage; unbekannte Parameter → unrecognized_keys', () => {
    expect(errorsOf({ to: '2026-11-19' })[0]).toMatchObject({ field: 'from', code: 'invalid_type' });
    expect(errorsOf({ from: '2026-02-30', to: '2026-03-01' })[0]).toMatchObject({ field: 'from', code: 'invalid_date' });
    expect(errorsOf({ from: '2025-01-01', to: '2026-01-01' })).toEqual([]);
    expect(errorsOf({ from: '2025-01-01', to: '2026-01-02' })[0]).toMatchObject({ field: 'to', code: 'range_too_long' });
    expect(errorsOf({ from: '2026-11-01', to: '2026-11-19', sort: 'asc' })[0]).toMatchObject({ field: 'sort', code: 'unrecognized_keys' });
  });
});
