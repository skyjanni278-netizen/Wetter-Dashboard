import { ApiValidationException } from '../../common/api-validation.exception';
import { YearParamSchema } from './year-param.schema';

function errorsOf(value: unknown) {
  const result = YearParamSchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('YearParamSchema (R05, ≥ 1940)', () => {
  it.each([
    ['1940', 1940],
    ['2025', 2025],
    ['2026', 2026],
  ])('%s ist gültig und wird zur Zahl %d', (year, expected) => {
    expect(YearParamSchema.parse({ year })).toEqual({ year: expected });
  });

  it('1939 → too_small am Feld year', () => {
    expect(errorsOf({ year: '1939' })).toEqual([
      { field: 'year', code: 'too_small', message: 'Daten gibt es frühestens ab 1940.' },
    ]);
  });

  it.each(['26', 'abc', '20255', '-2025', '2025.0', ''])('%j → invalid_format am Feld year', year => {
    expect(errorsOf({ year })).toEqual([
      { field: 'year', code: 'invalid_format', message: 'Bitte ein Jahr im Format JJJJ angeben.' },
    ]);
  });
});
