import type { JwtModuleOptions } from '@nestjs/jwt';

/** Feste Angaben jedes Tokens (03 B4.6); der `JwtAuthGuard` prüft sie bei jeder Anfrage. */
export const JWT_ISSUER = 'wetter-heubach';
export const JWT_AUDIENCE = 'wetter-heubach-admin';
export const JWT_ALGORITHM = 'HS256';

/** `JWT_SECRET` mindestens 32 Zeichen (03 B4.8), erzeugt mit `openssl rand -base64 48`. */
export const MIN_JWT_SECRET_LENGTH = 32;
export const DEFAULT_JWT_EXPIRES_IN = '1h';

/** Token für die geprüfte Konfiguration (`AuthService`: `expiresIn` der Antwort). */
export const JWT_CONFIG = Symbol('JWT_CONFIG');

export interface JwtConfig {
  secret: string;
  /** Laufzeit in Sekunden (`JWT_EXPIRES_IN`, Standard `1h` = 3600). */
  expiresInSeconds: number;
}

/** Ungültige Anmelde-Konfiguration; `main.ts` bricht den Start mit dieser Meldung ab (Exit-Code 1). */
export class JwtConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtConfigError';
  }
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** `3600`, `90s`, `30m`, `1h`, `1d` → Sekunden; sonst `null`. */
export function parseExpiresIn(value: string): number | null {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2] ?? 's'];
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Übergang bis Schritt 11 (dann `EnvSchema`, 03 B4.8): `JWT_SECRET` ist Pflicht und mindestens 32 Zeichen,
 * `JWT_EXPIRES_IN` optional (Standard `1h`). Sonst `JwtConfigError` mit klarer Meldung (fail fast).
 */
export function jwtConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JwtConfig {
  const secret = env['JWT_SECRET'] ?? '';
  if (secret.trim() === '') {
    throw new JwtConfigError(
      `JWT_SECRET fehlt. Ohne Secret kann die API keine Anmeldung prüfen. Erzeugen mit: openssl rand -base64 48`,
    );
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new JwtConfigError(
      `JWT_SECRET ist zu kurz (${secret.length} Zeichen, mindestens ${MIN_JWT_SECRET_LENGTH}). Erzeugen mit: openssl rand -base64 48`,
    );
  }
  const raw = env['JWT_EXPIRES_IN']?.trim() || DEFAULT_JWT_EXPIRES_IN;
  const expiresInSeconds = parseExpiresIn(raw);
  if (expiresInSeconds === null) {
    throw new JwtConfigError(`JWT_EXPIRES_IN="${raw}" ist ungültig. Erlaubt: Sekunden oder Zahl mit s, m, h, d (z. B. 1h).`);
  }
  return { secret, expiresInSeconds };
}

/**
 * Optionen für `JwtModule`: HS256 fest beim Signieren **und** Prüfen (kein `none`, kein anderes Verfahren),
 * `iss`/`aud` werden gesetzt und geprüft, `exp` aus `JWT_EXPIRES_IN`.
 */
export function jwtModuleOptions(config: JwtConfig): JwtModuleOptions {
  return {
    secret: config.secret,
    signOptions: { algorithm: JWT_ALGORITHM, expiresIn: config.expiresInSeconds, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    verifyOptions: { algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  };
}
