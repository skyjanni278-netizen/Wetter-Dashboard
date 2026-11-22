import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiException } from '../common/api.exception';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { bearerToken, JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { JWT_AUDIENCE, JWT_ISSUER, jwtModuleOptions } from './jwt-config';

const SECRET = 'unit-test-secret-mit-mindestens-32-zeichen';
const claims = { sub: 1, username: 'admin', roles: ['admin'] };

class Guest {
  @Public()
  open(): void {}

  closed(): void {}

  @Roles('admin')
  admin(): void {}
}

@Public()
class AllPublic {
  any(): void {}
}

function contextFor(target: object, handler: () => void, authorization?: string) {
  const request = { headers: authorization === undefined ? {} : { authorization } } as AuthenticatedRequest;
  const context = {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('JwtAuthGuard (03 B4.3, B4.6, B4.7)', () => {
  const jwt = new JwtService(jwtModuleOptions({ secret: SECRET, expiresInSeconds: 3600 }));
  const guard = new JwtAuthGuard(new Reflector(), jwt);
  const closed = (authorization?: string) => contextFor(Guest, Guest.prototype.closed, authorization);

  async function rejection(authorization?: string): Promise<ApiException> {
    try {
      await guard.canActivate(closed(authorization).context);
    } catch (error) {
      return error as ApiException;
    }
    throw new Error('Guard hat durchgelassen');
  }

  it('@Public() am Handler oder am Controller → durch, ohne Token', async () => {
    await expect(guard.canActivate(contextFor(Guest, Guest.prototype.open).context)).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(AllPublic, AllPublic.prototype.any).context)).resolves.toBe(true);
  });

  it('ohne @Public() und ohne Token → 401 UNAUTHENTICATED; @Roles allein öffnet nichts', async () => {
    const error = await rejection();
    expect(error).toBeInstanceOf(ApiException);
    expect(error.payload).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Anmeldung erforderlich.' });
    await expect(guard.canActivate(contextFor(Guest, Guest.prototype.admin).context)).rejects.toThrow(ApiException);
  });

  it('gültiges Token → durch, request.user = { sub, username, roles }', async () => {
    const { context, request } = closed(`Bearer ${await jwt.signAsync(claims)}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 1, username: 'admin', roles: ['admin'] });
  });

  it.each([
    ['abgelaufen', () => jwt.sign(claims, { expiresIn: -1 })],
    ['falsches aud', () => jwt.sign(claims, { audience: 'wetter-heubach-gast' })],
    ['falsches iss', () => jwt.sign(claims, { issuer: 'fremd' })],
    ['ohne aud/iss', () => new JwtService({ secret: SECRET }).sign(claims, { expiresIn: 60 })],
    ['anderes Secret', () => jwt.sign(claims, { secret: 'anderes-secret-mit-mindestens-32-zeichen' })],
    ['HS384 statt HS256', () => jwt.sign(claims, { algorithm: 'HS384' })],
    [
      'Algorithmus none (ohne Signatur)',
      () => {
        const now = Math.floor(Date.now() / 1000);
        return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...claims, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 60 })}.`;
      },
    ],
    ['sub ist Text', () => jwt.sign({ ...claims, sub: 'admin' })],
    ['roles fehlt', () => jwt.sign({ sub: 1, username: 'admin' })],
    ['Müll', () => 'a.b.c'],
  ])('Token %s → 401 UNAUTHENTICATED', async (_name, token) => {
    const error = await rejection(`Bearer ${token()}`);
    expect(error.payload).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });

  it('bearerToken: Schema ohne Rücksicht auf Groß-/Kleinschreibung, sonst null', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
