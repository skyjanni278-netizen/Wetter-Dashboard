import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail, ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';
import type { Response } from 'express';
import { LOGIN_THROTTLER } from './login-throttle';

/** Fenster des globalen Limits (03 B4.8): `THROTTLE_GLOBAL_LIMIT` Anfragen je 60 s und IP. */
export const GLOBAL_THROTTLE_TTL_MS = 60_000;
export const GLOBAL_THROTTLER_NAME = 'global';

/**
 * Globales Limit (03 B4.8, C1 A06) für **alle** Routen zusammen: Der Schlüssel ist nur die Client-IP (der Standard
 * des Throttlers zählt je Controller und Handler, dann wären es 120 je Route). `/api/health` ist nicht ausgenommen:
 * Ein Monitor fragt weit seltener als 120-mal je Minute, das Limit gilt je IP, und auch `health` liest die DB.
 */
export function globalThrottler(limit: number): ThrottlerOptions {
  return {
    name: GLOBAL_THROTTLER_NAME,
    limit,
    ttl: GLOBAL_THROTTLE_TTL_MS,
    generateKey: (_context, tracker, name) => createHash('sha256').update(`${name}-${tracker}`).digest('hex'),
  };
}

/** Optionen für `ThrottlerModule.forRootAsync`: globales Limit und Login-Limit (5 je 60 s, nur am Login). */
export function throttlerOptions(globalLimit: number): ThrottlerModuleOptions {
  return { throttlers: [globalThrottler(globalLimit), LOGIN_THROTTLER] };
}

/**
 * `ThrottlerGuard` mit Standard-Header `Retry-After` (Sekunden bis zum Ende der Sperre) bei **jeder** 429, egal
 * welcher Throttler sperrt. Der Throttler selbst setzt nur `Retry-After-<name>` (z. B. `Retry-After-login`), weil
 * keiner `default` heißt; diese Header bleiben zusätzlich. Die 429 baut der `ApiExceptionFilter` (B3.3).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    if (!res.headersSent) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    await super.throwThrottlingException(context, detail);
  }
}
