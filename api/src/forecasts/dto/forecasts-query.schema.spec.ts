import { ApiValidationException } from '../../common/api-validation.exception';
import { ForecastsQuerySchema } from './forecasts-query.schema';

describe('ForecastsQuerySchema (R22, US03-3)', () => {
  it('ohne Parameter gültig', () => {
    expect(ForecastsQuerySchema.parse({})).toEqual({});
  });

  it('?days=14 → unrecognized_keys am Feld days', () => {
    const result = ForecastsQuerySchema.safeParse({ days: '14' });
    expect(result.success).toBe(false);
    expect(ApiValidationException.fromZod(result.error!).errors).toEqual([
      { field: 'days', code: 'unrecognized_keys', message: 'Das Feld „days“ ist nicht erlaubt.' },
    ]);
  });

  it('Query-Objekt ohne Prototyp (Express) und mehrere unbekannte Parameter → je einer ein Eintrag', () => {
    const query = Object.assign(Object.create(null) as Record<string, unknown>, { days: ['1', '2'], sort: 'x' });
    const result = ForecastsQuerySchema.safeParse(query);
    expect(ApiValidationException.fromZod(result.error!).errors.map(e => e.field)).toEqual(['days', 'sort']);
  });
});
