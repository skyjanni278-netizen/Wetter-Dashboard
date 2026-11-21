import { ApiValidationException } from '../../common/api-validation.exception';
import { ImportsQuerySchema } from './imports-query.schema';

function errorsOf(value: unknown) {
  const result = ImportsQuerySchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

const LIMIT_MESSAGE = 'Das Limit muss eine ganze Zahl von 1 bis 100 sein.';
const PAGE_MESSAGE = 'Die Seite muss eine ganze Zahl ab 1 sein.';

describe('ImportsQuerySchema (GET /api/imports, US11-2/-4, R24)', () => {
  it('ohne Parameter: page = 1, limit = 20 (Standard)', () => {
    expect(ImportsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('US11-2: status=failed&page=1&limit=20 → Zahlen aus dem Query-String', () => {
    expect(ImportsQuerySchema.parse({ status: 'failed', page: '1', limit: '20' })).toEqual({
      status: 'failed',
      page: 1,
      limit: 20,
    });
  });

  it.each([
    ['1', 1],
    ['100', 100],
  ])('limit=%s ist gültig (Grenze)', (limit, expected) => {
    expect(ImportsQuerySchema.parse({ limit })).toMatchObject({ limit: expected });
  });

  it.each([
    ['0', 'too_small'],
    ['101', 'too_big'],
    ['500', 'too_big'],
    ['-1', 'too_small'],
    ['1.5', 'invalid_type'],
    ['abc', 'invalid_type'],
  ])('limit=%s → %s am Feld limit', (limit, code) => {
    expect(errorsOf({ limit })).toEqual([{ field: 'limit', code, message: LIMIT_MESSAGE }]);
  });

  it.each([
    ['0', 'too_small'],
    ['-1', 'too_small'],
    ['2.5', 'invalid_type'],
    ['x', 'invalid_type'],
  ])('page=%s → %s am Feld page', (page, code) => {
    expect(errorsOf({ page })).toEqual([{ field: 'page', code, message: PAGE_MESSAGE }]);
  });

  it('page=1 und page=7 sind gültig', () => {
    expect(ImportsQuerySchema.parse({ page: '1' }).page).toBe(1);
    expect(ImportsQuerySchema.parse({ page: '7' }).page).toBe(7);
  });

  it('mehrfacher Parameter (?limit=1&limit=2, Array) → Fehler am Feld limit', () => {
    expect(errorsOf({ limit: ['1', '2'] }).map(e => e.field)).toEqual(['limit']);
  });

  it.each(['queued', 'running', 'succeeded', 'partial', 'failed'])('status=%s ist gültig', status => {
    expect(ImportsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it.each(['legacy', 'range', 'gaps', 'scheduled'])('kind=%s ist gültig', kind => {
    expect(ImportsQuerySchema.parse({ kind })).toMatchObject({ kind });
  });

  it('unbekannter Status bzw. unbekannte Art → invalid_value', () => {
    expect(errorsOf({ status: 'done', kind: 'all' }).map(e => [e.field, e.code])).toEqual([
      ['status', 'invalid_value'],
      ['kind', 'invalid_value'],
    ]);
  });

  it('unbekannter Parameter (sort, R22) → unrecognized_keys', () => {
    expect(errorsOf({ sort: 'asc' })).toEqual([
      { field: 'sort', code: 'unrecognized_keys', message: 'Das Feld „sort“ ist nicht erlaubt.' },
    ]);
  });
});
