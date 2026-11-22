import { z } from 'zod';
import { parseExpiresIn } from '../auth/jwt-config';

/**
 * Felder der Konfiguration (03 B4.8), wörtlich nach dem Zielbild. Eigene Konstante, damit die CLI Teilschemas
 * bilden kann (`pick`); `EnvSchema` ist dieses Objekt mit der Regel für `FAKE_NOW`. **Nicht** `.strict()`,
 * weil `process.env` viele fremde Variablen enthält (sie fallen beim Parsen weg).
 */
export const EnvObjectSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  HOST: z.string().default('127.0.0.1'), // S9: nicht 0.0.0.0
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_PATH: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  TRUST_PROXY: z.string().default('loopback'), // echte Client-IP für Throttler/Logs
  CORS_ORIGINS: z.string().optional(), // leer = CORS aus (gleiche Origin)
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  OPEN_METEO_FORECAST_URL: z.url().default('https://api.open-meteo.com/v1/forecast'),
  OPEN_METEO_ARCHIVE_URL: z.url().default('https://archive-api.open-meteo.com/v1/archive'),
  OPEN_METEO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  DEV_ADMIN_PASSWORD: z.string().min(12).optional(),
  THROTTLE_GLOBAL_LIMIT: z.coerce.number().int().min(1).default(120), // Anfragen je 60 s und IP (C1 A06)
  FAKE_NOW: z.iso.datetime().optional(), // nur development/test
});

export const FAKE_NOW_RULE = 'FAKE_NOW nur in development/test und nur mit SCHEDULER_ENABLED=false';

/** Die Konfiguration der App (03 B4.8): `ConfigModule.forRoot({ validate })` prüft sie beim Start. */
export const EnvSchema = EnvObjectSchema.refine(
  e => !e.FAKE_NOW || (e.NODE_ENV !== 'production' && !e.SCHEDULER_ENABLED),
  { path: ['FAKE_NOW'], message: FAKE_NOW_RULE },
);

/** Geprüfte Werte (nach Standardwerten und Umwandlung), z. B. `PORT: number`, `SWAGGER_ENABLED: boolean`. */
export type Env = z.output<typeof EnvSchema>;

/**
 * Teilschemas der CLI (Begründung: die CLI startet keinen HTTP-Server und signiert keine Tokens, sie braucht
 * deshalb kein `JWT_SECRET`; eine `.env` ohne Secret, z. B. auf einem Rechner nur für Migrationen, reicht):
 * - `DatabaseEnvSchema`: `migration:*` (`data-source.ts`), `import:legacy` (ohne `--dry-run`), `admin:*`;
 * - `SeedEnvSchema`: `db:seed`, `db:reset` (dazu `DEV_ADMIN_PASSWORD`; `NODE_ENV=production` verbietet beide);
 * - `OpenMeteoEnvSchema`: `legacy:dst-check` (nur Open-Meteo, keine Datenbank).
 * `import:legacy --dry-run` öffnet keine Datenbank und braucht keinen Wert.
 */
export const DatabaseEnvSchema = EnvObjectSchema.pick({ NODE_ENV: true, DB_PATH: true });
export const SeedEnvSchema = EnvObjectSchema.pick({ NODE_ENV: true, DB_PATH: true, DEV_ADMIN_PASSWORD: true });
export const OpenMeteoEnvSchema = EnvObjectSchema.pick({
  OPEN_METEO_FORECAST_URL: true,
  OPEN_METEO_ARCHIVE_URL: true,
  OPEN_METEO_TIMEOUT_MS: true,
});

/** Ungültige Konfiguration: Die Meldung nennt jedes Feld, aber **nie** einen Wert (Secrets, Passwörter). */
export class EnvConfigError extends Error {
  constructor(readonly fields: string[], details: string[]) {
    super(`Konfiguration ungültig (.env bzw. Umgebungsvariablen): ${details.join('; ')}`);
    this.name = 'EnvConfigError';
  }
}

/** Deutsche Meldung je Zod-Fehler, ohne den Wert (Zod 4 gibt ihn ohne `reportInput` ohnehin nicht aus). */
function describeIssue(field: string, issue: z.core.$ZodIssue, raw: Record<string, unknown>): string {
  if ((issue.code === 'invalid_type' || issue.code === 'invalid_value') && raw[field] === undefined) return `${field} fehlt`;
  switch (issue.code) {
    case 'too_small':
      return issue.origin === 'string'
        ? `${field} ist zu kurz (mindestens ${String(issue.minimum)} Zeichen)${field === 'JWT_SECRET' ? ', erzeugen mit: openssl rand -base64 48' : ''}`
        : `${field} ist zu klein (mindestens ${String(issue.minimum)})`;
    case 'too_big':
      return `${field} ist zu groß (höchstens ${String(issue.maximum)})`;
    case 'invalid_value':
      return `${field} muss einer dieser Werte sein: ${issue.values.map(v => String(v)).join(', ')}`;
    case 'invalid_format':
      return `${field} hat kein gültiges Format (${issue.format})`;
    case 'invalid_type':
      return `${field} muss ${issue.expected === 'int' ? 'eine ganze Zahl' : issue.expected === 'number' ? 'eine Zahl' : `vom Typ ${issue.expected}`} sein`;
    default:
      return `${field}: ${issue.message}`;
  }
}

/** Wie `schema.parse(raw)`, aber mit einer Meldung je Feld (`EnvConfigError`) statt der JSON-Ausgabe von Zod. */
export function parseEnv<S extends z.ZodType>(schema: S, raw: Record<string, unknown>): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields: string[] = [];
  const details: string[] = [];
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join('.') || '(Konfiguration)';
    fields.push(field);
    details.push(describeIssue(field, issue, raw));
  }
  throw new EnvConfigError(fields, details);
}

/**
 * `validate` des `ConfigModule` (03 B4.8): `EnvSchema` und zwei Prüfungen, die B4.8 nicht als Schema fasst:
 * `JWT_EXPIRES_IN` muss lesbar sein (Sekunden oder Zahl mit s/m/h/d, sonst schlüge erst das Signieren fehl),
 * und `FIXTURE` gibt es seit Schritt 9 nicht mehr (statt still auf der Dev-DB zu starten, Hinweis auf den
 * neuen Weg). Ergebnis: die geprüften Werte, die der `ConfigService` liefert.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const fixture = typeof raw['FIXTURE'] === 'string' ? raw['FIXTURE'].trim() : '';
  if (fixture) {
    throw new EnvConfigError(
      ['FIXTURE'],
      [`FIXTURE wird nicht mehr unterstützt. Fixture in die Dev-DB laden: npm run db:seed -- --fixture <name>`],
    );
  }
  const env = parseEnv(EnvSchema, raw);
  if (parseExpiresIn(env.JWT_EXPIRES_IN) === null) {
    throw new EnvConfigError(
      ['JWT_EXPIRES_IN'],
      ['JWT_EXPIRES_IN ist ungültig (erlaubt: Sekunden oder Zahl mit s, m, h, d, z. B. 1h)'],
    );
  }
  return env;
}
