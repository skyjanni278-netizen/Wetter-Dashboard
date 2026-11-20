import { ApiValidationException } from '../../common/api-validation.exception';
import { DateParamSchema } from './date-param.schema';

function errorsOf(value: unknown) {
  const result = DateParamSchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('DateParamSchema (R01, US02-2/-3)', () => {
  it.each(['2026-11-10', '2028-02-29', '2026-02-28', '2025-12-31', '2025-01-01', '2024-02-29', '2000-02-29'])(
    '%s ist gültig',
    date => {
      expect(DateParamSchema.parse({ date })).toEqual({ date });
    },
  );

  it.each(['2026-02-29', '2026-02-30', '2026-11-1', '2026-13-01', '2026-00-10', '2026-04-31', '1900-02-29', 'heute', '', '2026-11-10T00:00', ' 2026-11-10'])(
    '%j → invalid_date am Feld date',
    date => {
      expect(errorsOf({ date })).toEqual([
        { field: 'date', code: 'invalid_date', message: 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.' },
      ]);
    },
  );

  it('fehlendes Datum → Fehler am Feld date', () => {
    expect(errorsOf({})).toEqual([{ field: 'date', code: 'invalid_type', message: 'Bitte ein Datum angeben.' }]);
  });

  it('unbekannter Pfadparameter → unrecognized_keys', () => {
    expect(errorsOf({ date: '2026-11-10', extra: 'x' })).toEqual([
      { field: 'extra', code: 'unrecognized_keys', message: 'Das Feld „extra“ ist nicht erlaubt.' },
    ]);
  });
});
