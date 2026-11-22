import { SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

/** Metadaten-Schlüssel von `@LoginThrottle()`. */
export const LOGIN_THROTTLE_KEY = 'loginThrottle';

/** Login-Limit (03 B3.2, US09-7, C1 A07): 5 Versuche je 60 s und Client-IP, der 6. → 429. */
export const LOGIN_THROTTLE_LIMIT = 5;
export const LOGIN_THROTTLE_TTL_MS = 60_000;

/** Markiert den Login-Handler; nur dort zählt der Throttler `login`. */
export const LoginThrottle = (): MethodDecorator => SetMetadata(LOGIN_THROTTLE_KEY, true);

function isLoginThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(LOGIN_THROTTLE_KEY, context.getHandler()) === true;
}

/**
 * Throttler `login` für `ThrottlerModule.forRoot`: gilt nur für Handler mit `@LoginThrottle()`, alle anderen
 * Routen überspringt er (`skipIf`). Gezählt wird jede Anfrage (auch 400), Schlüssel ist die Client-IP
 * (`req.ip`; Nest lauscht nur auf `127.0.0.1`, einen Proxy gibt es bis Schritt 11 nicht). Das globale Limit
 * (`THROTTLE_GLOBAL_LIMIT`) kommt in Schritt 11 als zweiter Eintrag dazu.
 */
export const LOGIN_THROTTLER: ThrottlerOptions = {
  name: 'login',
  limit: LOGIN_THROTTLE_LIMIT,
  ttl: LOGIN_THROTTLE_TTL_MS,
  skipIf: context => !isLoginThrottled(context),
};
