import { ApiValidationException } from '../api-validation.exception';
import { IdParamSchema, MAX_ID } from './id-param.schema';

describe('IdParamSchema (Pfadparameter :id)', () => {
  it.each([
    ['1', 1],
    ['99', 99],
    ['1234567890', 1234567890],
    ['2147483647', MAX_ID],
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

  it.each(['2147483648', '9999999999'])('%j → 400 too_big am Feld id (höchstens 2 147 483 647)', id => {
    const result = IdParamSchema.safeParse({ id });
    expect(result.success).toBe(false);
    expect(ApiValidationException.fromZod(result.error!).errors).toEqual([
      { field: 'id', code: 'too_big', message: 'Die ID darf höchstens 2147483647 sein.' },
    ]);
  });
});
