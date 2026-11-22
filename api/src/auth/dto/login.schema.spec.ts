import { ApiValidationException } from '../../common/api-validation.exception';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { LoginSchema } from './login.schema';

const pipe = new ZodValidationPipe(LoginSchema);

function errorsOf(body: unknown) {
  try {
    pipe.transform(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiValidationException);
    return (error as ApiValidationException).errors.map(e => ({ field: e.field, code: e.code }));
  }
  throw new Error('kein Fehler');
}

describe('LoginSchema (03 B4.6, R21, US09-4/-5)', () => {
  it('gültig; username getrimmt und klein geschrieben, Passwort unverändert', () => {
    expect(pipe.transform({ username: '  Admin ', password: ' Geheim 1 ' })).toEqual({ username: 'admin', password: ' Geheim 1 ' });
  });

  it('username: 3–50 Zeichen nach dem Trimmen', () => {
    expect(errorsOf({ username: ' ab ', password: 'x' })).toEqual([{ field: 'username', code: 'too_small' }]);
    expect(pipe.transform({ username: 'abc', password: 'x' }).username).toBe('abc');
    expect(pipe.transform({ username: 'a'.repeat(50), password: 'x' }).username).toHaveLength(50);
    expect(errorsOf({ username: 'a'.repeat(51), password: 'x' })).toEqual([{ field: 'username', code: 'too_big' }]);
    expect(errorsOf({ username: 42, password: 'x' })).toEqual([{ field: 'username', code: 'invalid_type' }]);
  });

  it('US09-4: password fehlt → invalid_type, leer → too_small', () => {
    expect(errorsOf({ username: 'admin' })).toEqual([{ field: 'password', code: 'invalid_type' }]);
    expect(errorsOf({ username: 'admin', password: '' })).toEqual([{ field: 'password', code: 'too_small' }]);
  });

  it('password höchstens 72 Byte (bcrypt): 72 gültig, 73 → too_big; Mehrbyte-Zeichen zählen als Bytes', () => {
    expect(pipe.transform({ username: 'admin', password: 'a'.repeat(72) }).password).toHaveLength(72);
    expect(errorsOf({ username: 'admin', password: 'a'.repeat(73) })).toEqual([{ field: 'password', code: 'too_big' }]);
    expect(errorsOf({ username: 'admin', password: 'ä'.repeat(37) })).toEqual([{ field: 'password', code: 'too_big' }]);
  });

  it('US09-5: Zusatzfeld roles → unrecognized_keys an "roles" (Mass Assignment)', () => {
    expect(errorsOf({ username: 'admin', password: 'x', roles: ['admin'] })).toEqual([{ field: 'roles', code: 'unrecognized_keys' }]);
  });

  it('kein Objekt → Fehler am ganzen Body', () => {
    expect(errorsOf(['admin'])).toEqual([{ field: null, code: 'invalid_type' }]);
  });
});
