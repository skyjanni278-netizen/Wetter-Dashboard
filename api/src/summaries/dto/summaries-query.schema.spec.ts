import { ApiValidationException } from '../../common/api-validation.exception';
import { MonthsQuerySchema, YearsQuerySchema } from './summaries-query.schema';

function errorsOf(schema: typeof MonthsQuerySchema | typeof YearsQuerySchema, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('MonthsQuerySchema (GET /api/summaries/months?year=, US05-2/-6, R05)', () => {
  it.each([
    ['1940', 1940],
    ['2025', 2025],
    ['2026', 2026],
  ])('year=%s ist gültig und wird zur Zahl %d', (year, expected) => {
    expect(MonthsQuerySchema.parse({ year })).toEqual({ year: expected });
  });

  it.each(['abc', '26', '20255', '2025.0', ''])('year=%j → invalid_format am Feld year (US05-6)', year => {
    expect(errorsOf(MonthsQuerySchema, { year })).toEqual([
      { field: 'year', code: 'invalid_format', message: 'Bitte ein Jahr im Format JJJJ angeben.' },
    ]);
  });

  it('year=1939 → too_small am Feld year', () => {
    expect(errorsOf(MonthsQuerySchema, { year: '1939' })).toEqual([
      { field: 'year', code: 'too_small', message: 'Daten gibt es frühestens ab 1940.' },
    ]);
  });

  it('year fehlt → Fehler am Feld year (Pflicht)', () => {
    expect(errorsOf(MonthsQuerySchema, {})).toEqual([
      { field: 'year', code: 'invalid_type', message: 'Bitte ein Jahr im Format JJJJ angeben.' },
    ]);
  });

  it('unbekannter Parameter (R22) → unrecognized_keys', () => {
    expect(errorsOf(MonthsQuerySchema, { year: '2025', sort: 'desc' })).toEqual([
      { field: 'sort', code: 'unrecognized_keys', message: 'Das Feld „sort“ ist nicht erlaubt.' },
    ]);
  });
});

describe('YearsQuerySchema (GET /api/summaries/years, R22)', () => {
  it('ohne Parameter gültig', () => {
    expect(YearsQuerySchema.parse({})).toEqual({});
  });

  it('jeder Parameter → unrecognized_keys', () => {
    expect(errorsOf(YearsQuerySchema, { year: '2025' })).toEqual([
      { field: 'year', code: 'unrecognized_keys', message: 'Das Feld „year“ ist nicht erlaubt.' },
    ]);
  });
});
