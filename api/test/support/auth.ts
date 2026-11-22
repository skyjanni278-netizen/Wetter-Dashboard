import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { AuthService } from '../../src/auth/auth.service';
import { ADMIN_ROLE } from '../../src/users/role.entity';

/**
 * Admin-Token für e2e-Tests geschützter Endpunkte (`/api/imports`, `/api/gaps`, Schritt 10). Signiert über den
 * `AuthService` der App mit demselben `JWT_SECRET` (test-env.ts), also wie nach einer Anmeldung, aber ohne
 * bcrypt und ohne den Login-Throttler. Den echten Login-Weg prüft `auth.e2e-spec.ts`. Der `JwtAuthGuard` prüft
 * nur das Token; ein Konto in der Datenbank braucht es dafür nicht.
 */
export async function adminToken(app: INestApplication): Promise<string> {
  const token = await app.get(AuthService).issueToken({ id: 1, username: 'admin', roles: [ADMIN_ROLE] });
  return token.accessToken;
}

/** Header für supertest: `.set(authHeader(token))`. */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Speicher des Throttlers, den ein Test leeren kann (`overrideProvider(ThrottlerStorage).useValue(…)`): Alle
 * Anfragen eines e2e-Tests kommen von derselben IP, das Login-Limit (5 je Minute) gälte sonst über Tests hinweg.
 */
export class ResettableThrottlerStorage implements ThrottlerStorage {
  private inner = new ThrottlerStorageService();

  increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): ReturnType<ThrottlerStorage['increment']> {
    return this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  reset(): void {
    this.inner.onApplicationShutdown();
    this.inner = new ThrottlerStorageService();
  }

  onApplicationShutdown(): void {
    this.inner.onApplicationShutdown();
  }
}
