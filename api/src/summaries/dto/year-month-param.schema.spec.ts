import { ApiValidationException } from '../../common/api-validation.exception';
import { YearMonthParamSchema } from './year-month-param.schema';

function errorsOf(value: unknown) {
  const result = YearMonthParamSchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('YearMonthParamSchema (R04, US04-3)', () => {
  it.each(['2025-03', '2025-01', '2025-12', '2026-11'])('%s ist gültig', yearMonth => {
    expect(YearMonthParamSchema.parse({ yearMonth })).toEqual({ yearMonth });
  });

  it.each(['2025-00', '2025-13', '2025-3', '2026-13', '25-03', '2025-03-01', '2025/03', 'abc', ''])(
    '%j → 400 am Feld yearMonth',
    yearMonth => {
      expect(errorsOf({ yearMonth })).toEqual([
        { field: 'yearMonth', code: 'invalid_format', message: 'Bitte einen Monat im Format JJJJ-MM (01–12) angeben.' },
      ]);
    },
  );
});
