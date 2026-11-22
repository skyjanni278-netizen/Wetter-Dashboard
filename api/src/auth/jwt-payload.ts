import { z } from 'zod';
import type { AuthUser } from '../users/user';

/** Eigene Angaben im Token (03 B4.6); `iss`, `aud`, `iat`, `exp` setzt `JwtService` aus den Optionen. */
export interface JwtClaims {
  sub: number;
  username: string;
  roles: string[];
}

/**
 * Form eines geprüften Tokens. Signatur, Verfahren, `iss`, `aud` und `exp` prüft `JwtService.verifyAsync`; ein
 * Token mit gültiger Signatur, aber fremder Form (z. B. `sub` als Text) gilt trotzdem als ungültig.
 */
export const JwtPayloadSchema = z.object({
  sub: z.number().int().positive(),
  username: z.string().min(1),
  roles: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
});

export function toAuthUser(payload: z.infer<typeof JwtPayloadSchema>): AuthUser {
  return { sub: payload.sub, username: payload.username, roles: payload.roles };
}
