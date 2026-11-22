import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api.exception';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import type { AuthUser } from '../users/user';
import { MISSING_ROLE_MESSAGE, NO_ACCESS_RULE_MESSAGE, RolesGuard } from './roles.guard';

@Public()
class PublicController {
  list(): void {}
}

@Roles('admin')
class AdminController {
  list(): void {}
  @Roles('editor')
  edit(): void {}
}

class PlainController {
  nothing(): void {}
  @Public()
  open(): void {}
  @Roles('admin')
  guarded(): void {}
  @Roles()
  empty(): void {}
}

function context(controller: new () => object, handler: string, user?: AuthUser): ExecutionContext {
  const request = { user };
  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const admin: AuthUser = { sub: 1, username: 'admin', roles: ['admin'] };
const nobody: AuthUser = { sub: 99, username: 'test', roles: [] };

function rejection(fn: () => unknown): { status: number; code: string; message: string } {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    const e = error as ApiException;
    const body = e.getResponse() as { code: string; message: string };
    return { status: e.getStatus(), code: body.code, message: body.message };
  }
  throw new Error('kein Fehler');
}

describe('RolesGuard (03 B4.7: Standard verboten)', () => {
  const guard = new RolesGuard(new Reflector());

  it('@Public() am Controller oder Handler → durch, auch ohne Benutzer', () => {
    expect(guard.canActivate(context(PublicController, 'list'))).toBe(true);
    expect(guard.canActivate(context(PlainController, 'open'))).toBe(true);
  });

  it('@Roles("admin") und Token mit Rolle admin → durch (Controller oder Handler)', () => {
    expect(guard.canActivate(context(AdminController, 'list', admin))).toBe(true);
    expect(guard.canActivate(context(PlainController, 'guarded', admin))).toBe(true);
  });

  it('US09-8, US10-2: Token ohne die Rolle → 403 FORBIDDEN', () => {
    expect(rejection(() => guard.canActivate(context(AdminController, 'list', nobody)))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: MISSING_ROLE_MESSAGE,
    });
  });

  it('der Handler gewinnt gegen den Controller (@Roles("editor") am Handler verlangt editor)', () => {
    expect(rejection(() => guard.canActivate(context(AdminController, 'edit', admin))).status).toBe(403);
    expect(guard.canActivate(context(AdminController, 'edit', { ...admin, roles: ['editor'] }))).toBe(true);
  });

  it('ohne @Public() und ohne @Roles() → 403, auch mit Admin-Token (vergessener Dekorator sperrt)', () => {
    expect(rejection(() => guard.canActivate(context(PlainController, 'nothing', admin)))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: NO_ACCESS_RULE_MESSAGE,
    });
  });

  it('leeres @Roles() zählt wie kein Dekorator → 403', () => {
    expect(rejection(() => guard.canActivate(context(PlainController, 'empty', admin))).status).toBe(403);
  });

  it('ohne request.user (JwtAuthGuard hätte vorher 401 geliefert) → 403, nie durch', () => {
    expect(rejection(() => guard.canActivate(context(AdminController, 'list'))).status).toBe(403);
  });
});
