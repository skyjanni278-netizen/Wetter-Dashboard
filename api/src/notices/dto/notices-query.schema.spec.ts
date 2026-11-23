import { ApiValidationException } from '../../common/api-validation.exception';
import { NoticesQuerySchema } from './notices-query.schema';

describe('NoticesQuerySchema (R22, US20-5)', () => {
  it('ohne Parameter gültig', () => {
    expect(NoticesQuerySchema.parse({})).toEqual({});
  });

  it('?days=3 → unrecognized_keys am Feld days', () => {
    const result = NoticesQuerySchema.safeParse({ days: '3' });
    expect(result.success).toBe(false);
    expect(ApiValidationException.fromZod(result.error!).errors).toEqual([
      { field: 'days', code: 'unrecognized_keys', message: 'Das Feld „days“ ist nicht erlaubt.' },
    ]);
  });
});
