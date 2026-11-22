import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api.exception';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { ROLES_KEY } from '../common/roles.decorator';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Meldungen der 403 (`FORBIDDEN`, 03 B3.3); beide ohne Angaben zum Token. */
export const MISSING_ROLE_MESSAGE = 'Für diese Anfrage fehlt die nötige Rolle.';
export const NO_ACCESS_RULE_MESSAGE = 'Dieser Endpunkt ist nicht freigegeben.';

/** Rollen aus `@Roles(...)` an Handler oder Controller (der Handler gewinnt); ohne Dekorator `undefined`. */
export function requiredRoles(reflector: Reflector, context: ExecutionContext): string[] | undefined {
  return reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
}

/**
 * Dritter globaler Guard (03 B4.3, B4.7; `APP_GUARD` nach `ThrottlerGuard` und `JwtAuthGuard`). **Standard:
 * verboten.** `@Public()` lässt durch (der `JwtAuthGuard` hat dann kein Token verlangt). Sonst muss `@Roles(...)`
 * mit mindestens einer Rolle am Handler oder Controller stehen, und das Token (`request.user`, gesetzt vom
 * `JwtAuthGuard`) muss eine davon haben. Fehlt der Dekorator, ist er leer oder fehlt die Rolle → 403 `FORBIDDEN`.
 * Ein vergessener Dekorator sperrt also, statt zu öffnen (US09-8, US10-2). Die Rollen kommen aus dem Token; der
 * Guard liest die Datenbank nicht.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const roles = requiredRoles(this.reflector, context);
    if (!roles || roles.length === 0) throw new ApiException(403, 'FORBIDDEN', NO_ACCESS_RULE_MESSAGE);

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.some(role => user.roles.includes(role))) {
      throw new ApiException(403, 'FORBIDDEN', MISSING_ROLE_MESSAGE);
    }
    return true;
  }
}
