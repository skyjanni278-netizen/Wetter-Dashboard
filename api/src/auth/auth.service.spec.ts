import { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import { ApiException } from '../common/api.exception';
import { FixedClock } from '../common/clock';
import * as password from '../users/password';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService, INVALID_CREDENTIALS_MESSAGE } from './auth.service';
import { JWT_AUDIENCE, JWT_ISSUER, jwtModuleOptions } from './jwt-config';

const SECRET = 'unit-test-secret-mit-mindestens-32-zeichen';
const PASSWORD = 'richtiges-Passwort-42';

describe('AuthService (03 B4.6, R21, US09)', () => {
  let dataSource: DataSource;
  let users: UsersService;
  let service: AuthService;
  const clock = new FixedClock('2026-11-19T13:30:00Z');
  const jwt = new JwtService(jwtModuleOptions({ secret: SECRET, expiresInSeconds: 3600 }));

  beforeEach(async () => {
    dataSource = await openTestDatabase();
    users = new UsersService(dataSource.getRepository(User));
    // Kosten 4 nur für die Geschwindigkeit dieses Tests; den echten Weg (12) misst auth.e2e-spec.ts.
    await users.createAdmin('admin', await password.hashPassword(PASSWORD, 4), new Date('2026-11-01T09:00:00Z'));
    service = new AuthService(users, jwt, clock, { secret: SECRET, expiresInSeconds: 3600 });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.destroy();
  });

  async function rejection(promise: Promise<unknown>): Promise<ApiException> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      return error as ApiException;
    }
    throw new Error('kein Fehler');
  }

  it('Erfolg: Token (HS256, sub/username/roles, iss/aud, 1 h) und Benutzer ohne Hash; lastLoginAt gesetzt', async () => {
    const result = await service.login({ username: 'admin', password: PASSWORD });
    expect(result).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: 1, username: 'admin', roles: ['admin'] },
    });
    const payload = await jwt.verifyAsync(result.accessToken);
    expect(payload).toMatchObject({ sub: 1, username: 'admin', roles: ['admin'], iss: JWT_ISSUER, aud: JWT_AUDIENCE });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(JSON.stringify(result)).not.toMatch(/password|\$2[aby]\$/i);
    expect((await users.findById(1))!.lastLoginAt).toBe('2026-11-19T13:30:00Z');
  });

  it('falsches Passwort → 401 INVALID_CREDENTIALS, lastLoginAt bleibt null', async () => {
    const error = await rejection(service.login({ username: 'admin', password: 'falsch-falsch-falsch' }));
    expect(error.payload).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE });
    expect((await users.findById(1))!.lastLoginAt).toBeNull();
  });

  it('unbekannter Name → dieselbe 401 und trotzdem genau ein compare gegen den Dummy-Hash (US09-3)', async () => {
    const verify = jest.spyOn(password, 'verifyPassword');
    const error = await rejection(service.login({ username: 'niemand', password: PASSWORD }));
    expect(error.payload).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(PASSWORD, password.DUMMY_PASSWORD_HASH);
  });

  it('bekanntes Konto: genau ein compare gegen den eigenen Hash', async () => {
    const verify = jest.spyOn(password, 'verifyPassword');
    await rejection(service.login({ username: 'admin', password: 'falsch-falsch-falsch' }));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][1]).toMatch(/^\$2[aby]\$04\$/);
  });

  it('gesperrtes Konto (is_active = 0) → 401 INVALID_CREDENTIALS auch mit richtigem Passwort (R21)', async () => {
    await dataSource.query(`UPDATE "user" SET "is_active" = 0`);
    const error = await rejection(service.login({ username: 'admin', password: PASSWORD }));
    expect(error.payload.code).toBe('INVALID_CREDENTIALS');
  });

  it('me(): Mapper ohne Hash (genau die Felder aus B2.2); unbekanntes sub → 401 UNAUTHENTICATED', async () => {
    const me = await service.me(1);
    expect(me).toEqual({
      id: 1,
      username: 'admin',
      roles: ['admin'],
      isActive: true,
      createdAt: '2026-11-01T09:00:00Z',
      lastLoginAt: null,
    });
    expect(Object.keys(me)).not.toContain('passwordHash');
    expect((await rejection(service.me(99))).payload).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });
});
