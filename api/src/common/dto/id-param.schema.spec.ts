import { ApiValidationException } from '../api-validation.exception';
import { IdParamSchema } from './id-param.schema';

describe('IdParamSchema (Pfadparameter :id)', () => {
  it.each([
    ['1', 1],
    ['99', 99],
    ['1234567890', 1234567890],
  ])('%s → %d', (id, expected) => {
    expect(IdParamSchema.parse({ id })).toEqual({ id: expected });
  });

  it.each(['abc', '0', '-1', '1.5', '1e3', ' 1', '01', '', '12345678901'])('%j → 400 am Feld id', id => {
    const result = IdParamSchema.safeParse({ id });
    expect(result.success).toBe(false);
    expect(ApiValidationException.fromZod(result.error!).errors).toEqual([
      { field: 'id', code: 'invalid_format', message: 'Die ID muss eine positive ganze Zahl sein.' },
    ]);
  });
});
