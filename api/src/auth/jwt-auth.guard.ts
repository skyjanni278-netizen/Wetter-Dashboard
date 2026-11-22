import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import type { AuthUser } from '../users/user';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from './jwt-config';
import { JwtPayloadSchema, toAuthUser } from './jwt-payload';

/** Anfrage nach dem `JwtAuthGuard`: `user` ist gesetzt, wenn ein gültiges Token mitkam. */
export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Token aus `Authorization: Bearer <token>` (Schema ohne Rücksicht auf Groß-/Kleinschreibung), sonst `null`. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match ? match[1] : null;
}

function unauthenticated(message: string): ApiException {
  return new ApiException(401, 'UNAUTHENTICATED', message);
}

/**
 * Globaler Guard (03 B4.3, B4.7; `APP_GUARD` nach dem `ThrottlerGuard`): `@Public()` an Handler oder Controller
 * lässt durch. Sonst muss ein gültiges Token kommen, geprüft mit festem Verfahren HS256 (kein `none`, kein
 * anderes HMAC), `iss`, `aud` und `exp`; danach `request.user = { sub, username, roles }`. Fehlt es oder ist es
 * ungültig/abgelaufen → 401 `UNAUTHENTICATED`. Rollen prüft ab Schritt 11 der `RolesGuard`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthenticated('Anmeldung erforderlich.');

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw unauthenticated('Das Token ist ungültig oder abgelaufen. Bitte neu anmelden.');
    }
    const parsed = JwtPayloadSchema.safeParse(payload);
    if (!parsed.success) throw unauthenticated('Das Token ist ungültig oder abgelaufen. Bitte neu anmelden.');
    request.user = toAuthUser(parsed.data);
    return true;
  }
}
