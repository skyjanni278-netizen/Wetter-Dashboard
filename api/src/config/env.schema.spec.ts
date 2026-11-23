import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { envSourceOptions, loadEnv } from './config';
import {
  BackupEnvSchema,
  DatabaseEnvSchema,
  EnvConfigError,
  EnvSchema,
  FAKE_NOW_RULE,
  OpenMeteoEnvSchema,
  parseEnv,
  SeedEnvSchema,
  validateEnv,
} from './env.schema';

const SECRET = 'ein-test-secret-mit-genau-32-zei';
const BASE = { NODE_ENV: 'development', DB_PATH: 'weather.dev.db', JWT_SECRET: SECRET };

/** Fehler von `fn` (muss `EnvConfigError` sein). */
function configError(fn: () => unknown): EnvConfigError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EnvConfigError);
    return error as EnvConfigError;
  }
  throw new Error('kein Fehler');
}

describe('EnvSchema (03 B4.8)', () => {
  it('Pflichtfelder gesetzt → Standardwerte für alles andere', () => {
    expect(EnvSchema.parse(BASE)).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DB_PATH: 'weather.dev.db',
      JWT_SECRET: SECRET,
      JWT_EXPIRES_IN: '1h',
      TRUST_PROXY: 'loopback',
      SWAGGER_ENABLED: false,
      SCHEDULER_ENABLED: true,
      OPEN_METEO_FORECAST_URL: 'https://api.open-meteo.com/v1/forecast',
      OPEN_METEO_ARCHIVE_URL: 'https://archive-api.open-meteo.com/v1/archive',
      OPEN_METEO_TIMEOUT_MS: 15000,
      THROTTLE_GLOBAL_LIMIT: 120,
    });
  });

  it('nicht .strict(): fremde Variablen (PATH, …) fallen weg statt zu stören', () => {
    const env = EnvSchema.parse({ ...BASE, PATH: '/usr/bin', LOCALAPPDATA: 'C:\\x' });
    expect(env).not.toHaveProperty('PATH');
    expect(env).not.toHaveProperty('LOCALAPPDATA');
  });

  it('Text aus .env wird umgewandelt: Zahlen und true/false', () => {
    const env = EnvSchema.parse({
      ...BASE,
      PORT: '3002',
      THROTTLE_GLOBAL_LIMIT: '500',
      OPEN_METEO_TIMEOUT_MS: '20000',
      SWAGGER_ENABLED: 'true',
      SCHEDULER_ENABLED: 'false',
    });
    expect(env).toMatchObject({ PORT: 3002, THROTTLE_GLOBAL_LIMIT: 500, OPEN_METEO_TIMEOUT_MS: 20000, SWAGGER_ENABLED: true, SCHEDULER_ENABLED: false });
  });

  it.each(['NODE_ENV', 'DB_PATH', 'JWT_SECRET'])('Pflichtfeld %s fehlt → Fehler mit Feldname', field => {
    const raw: Record<string, string> = { ...BASE };
    delete raw[field];
    const error = configError(() => parseEnv(EnvSchema, raw));
    expect(error.fields).toEqual([field]);
    expect(error.message).toContain(`${field} fehlt`);
  });

  it('ohne irgendeinen Wert: alle drei Pflichtfelder in einer Meldung', () => {
    expect(configError(() => parseEnv(EnvSchema, {})).fields.sort()).toEqual(['DB_PATH', 'JWT_SECRET', 'NODE_ENV']);
  });

  it('JWT_SECRET mit 31 Zeichen → Fehler nennt Feld und Mindestlänge, aber nie den Wert', () => {
    const secret = 'geheim-geheim-geheim-geheim-123'; // 31 Zeichen
    const error = configError(() => parseEnv(EnvSchema, { ...BASE, JWT_SECRET: secret }));
    expect(error.fields).toEqual(['JWT_SECRET']);
    expect(error.message).toContain('JWT_SECRET ist zu kurz (mindestens 32 Zeichen)');
    expect(error.message).toContain('openssl rand -base64 48');
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('geheim');
  });

  it('DEV_ADMIN_PASSWORD unter 12 Zeichen → Fehler ohne den Wert', () => {
    const error = configError(() => parseEnv(EnvSchema, { ...BASE, DEV_ADMIN_PASSWORD: 'Kurz-123' }));
    expect(error.fields).toEqual(['DEV_ADMIN_PASSWORD']);
    expect(error.message).not.toContain('Kurz-123');
  });

  it.each([
    ['NODE_ENV', 'prod', 'muss einer dieser Werte sein: development, test, production'],
    ['PORT', 'abc', 'muss eine Zahl sein'],
    ['PORT', '70000', 'zu groß (höchstens 65535)'],
    ['PORT', '0', 'zu klein (mindestens 1)'],
    ['THROTTLE_GLOBAL_LIMIT', '1.5', 'eine ganze Zahl'],
    ['OPEN_METEO_TIMEOUT_MS', '500', 'zu klein (mindestens 1000)'],
    ['OPEN_METEO_FORECAST_URL', 'keine-url', 'kein gültiges Format (url)'],
    ['SWAGGER_ENABLED', 'TRUE', 'muss einer dieser Werte sein: true, false'],
    ['SCHEDULER_ENABLED', '1', 'muss einer dieser Werte sein: true, false'],
    ['DB_PATH', '', 'DB_PATH ist zu kurz (mindestens 1 Zeichen)'],
  ])('%s=%p → Fehler „%s“ am Feld', (field, value, text) => {
    const error = configError(() => parseEnv(EnvSchema, { ...BASE, [field]: value }));
    expect(error.fields).toEqual([field]);
    expect(error.message).toContain(text);
  });

  describe('FAKE_NOW', () => {
    const fake = '2026-11-19T13:30:00Z';

    it('mit SCHEDULER_ENABLED=false in development/test erlaubt', () => {
      expect(EnvSchema.parse({ ...BASE, FAKE_NOW: fake, SCHEDULER_ENABLED: 'false' }).FAKE_NOW).toBe(fake);
      expect(EnvSchema.parse({ ...BASE, NODE_ENV: 'test', FAKE_NOW: fake, SCHEDULER_ENABLED: 'false' }).FAKE_NOW).toBe(fake);
    });

    it('mit Scheduler (Standard true) oder in Produktion → Fehler am Feld FAKE_NOW', () => {
      for (const raw of [
        { ...BASE, FAKE_NOW: fake },
        { ...BASE, FAKE_NOW: fake, SCHEDULER_ENABLED: 'true' },
        { ...BASE, NODE_ENV: 'production', FAKE_NOW: fake, SCHEDULER_ENABLED: 'false' },
      ]) {
        const error = configError(() => parseEnv(EnvSchema, raw));
        expect(error.fields).toEqual(['FAKE_NOW']);
        expect(error.message).toContain(FAKE_NOW_RULE);
      }
    });

    it.each(['gestern', '2026-11-19', '2026-11-19T13:30:00+01:00', '2026-02-30T10:00:00Z', '2026-11-19 13:30:00Z', ''])(
      'ungültiger Zeitpunkt %p → Fehler',
      value => {
        const error = configError(() => parseEnv(EnvSchema, { ...BASE, SCHEDULER_ENABLED: 'false', FAKE_NOW: value }));
        expect(error.fields).toEqual(['FAKE_NOW']);
        expect(error.message).toContain('FAKE_NOW hat kein gültiges Format (datetime)');
      },
    );
  });
});

describe('validateEnv (validate des ConfigModule)', () => {
  it('gültig → geprüfte Werte', () => {
    expect(validateEnv({ ...BASE, JWT_EXPIRES_IN: '30m' })).toMatchObject({ JWT_EXPIRES_IN: '30m', PORT: 3000 });
  });

  it('JWT_EXPIRES_IN unlesbar → Fehler am Feld', () => {
    const error = configError(() => validateEnv({ ...BASE, JWT_EXPIRES_IN: 'bald' }));
    expect(error.fields).toEqual(['JWT_EXPIRES_IN']);
  });

  it('FIXTURE (seit Schritt 9 entfallen) → Fehler mit Hinweis auf db:seed --fixture', () => {
    const error = configError(() => validateEnv({ ...BASE, FIXTURE: 'us16-ok' }));
    expect(error.fields).toEqual(['FIXTURE']);
    expect(error.message).toContain('npm run db:seed -- --fixture <name>');
  });
});

describe('Teilschemas der CLI (kein JWT_SECRET)', () => {
  it('DatabaseEnvSchema (migration:*, import:legacy, admin:*): NODE_ENV und DB_PATH, kein Secret nötig', () => {
    expect(parseEnv(DatabaseEnvSchema, { NODE_ENV: 'development', DB_PATH: 'x.db' })).toEqual({ NODE_ENV: 'development', DB_PATH: 'x.db' });
    expect(configError(() => parseEnv(DatabaseEnvSchema, { NODE_ENV: 'development' })).fields).toEqual(['DB_PATH']);
  });

  it('SeedEnvSchema (db:seed, db:reset): DEV_ADMIN_PASSWORD optional, mindestens 12 Zeichen', () => {
    expect(parseEnv(SeedEnvSchema, { NODE_ENV: 'development', DB_PATH: 'x.db' })).toEqual({ NODE_ENV: 'development', DB_PATH: 'x.db' });
    expect(configError(() => parseEnv(SeedEnvSchema, { NODE_ENV: 'development', DB_PATH: 'x.db', DEV_ADMIN_PASSWORD: 'kurz' })).fields).toEqual([
      'DEV_ADMIN_PASSWORD',
    ]);
  });

  it('BackupEnvSchema (db:backup, db:restore): BACKUP_DIR optional, BACKUP_KEEP Standard 14, ganze Zahl ab 1', () => {
    const base = { NODE_ENV: 'development', DB_PATH: 'x.db' };
    expect(parseEnv(BackupEnvSchema, base)).toEqual({ ...base, BACKUP_KEEP: 14 });
    expect(parseEnv(BackupEnvSchema, { ...base, BACKUP_DIR: 'C:\\Sicherung', BACKUP_KEEP: '30' })).toEqual({
      ...base,
      BACKUP_DIR: 'C:\\Sicherung',
      BACKUP_KEEP: 30,
    });
    for (const BACKUP_KEEP of ['0', '2.5', 'viele']) {
      expect(configError(() => parseEnv(BackupEnvSchema, { ...base, BACKUP_KEEP })).fields).toEqual(['BACKUP_KEEP']);
    }
    expect(configError(() => parseEnv(BackupEnvSchema, { ...base, BACKUP_DIR: '' })).fields).toEqual(['BACKUP_DIR']);
    expect(configError(() => parseEnv(BackupEnvSchema, { NODE_ENV: 'development' })).fields).toEqual(['DB_PATH']);
  });

  it('OpenMeteoEnvSchema (legacy:dst-check): nur Standardwerte, nichts Pflicht', () => {
    expect(parseEnv(OpenMeteoEnvSchema, {})).toEqual({
      OPEN_METEO_FORECAST_URL: 'https://api.open-meteo.com/v1/forecast',
      OPEN_METEO_ARCHIVE_URL: 'https://archive-api.open-meteo.com/v1/archive',
      OPEN_METEO_TIMEOUT_MS: 15000,
    });
  });
});

describe('Quelle der Werte: .env im Arbeitsverzeichnis, Umgebung hat Vorrang', () => {
  const saved = { ...process.env };
  const cwd = process.cwd();
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'wetter-env-'));
    process.chdir(dir);
  });
  afterEach(async () => {
    process.chdir(cwd);
    process.env = { ...saved };
    await rm(dir, { recursive: true, force: true });
  });

  it('NODE_ENV=test (Jest) → keine .env; sonst wird sie gelesen', () => {
    expect(envSourceOptions({ NODE_ENV: 'test' })).toEqual({ ignoreEnvFile: true });
    expect(envSourceOptions({ NODE_ENV: 'development' })).toEqual({ ignoreEnvFile: false });
    expect(envSourceOptions({})).toEqual({ ignoreEnvFile: false });
  });

  it('loadEnv liest .env; eine Umgebungsvariable überschreibt die Datei', async () => {
    await writeFile(path.join(dir, '.env'), '# Kommentar\nNODE_ENV=development\nDB_PATH=aus-der-datei.db\n');
    process.env = { PATH: saved['PATH'] }; // keine Test-Werte, sonst gälte NODE_ENV=test
    expect(await loadEnv(DatabaseEnvSchema)).toEqual({ NODE_ENV: 'development', DB_PATH: 'aus-der-datei.db' });

    process.env = { PATH: saved['PATH'], DB_PATH: 'aus-der-umgebung.db' };
    expect((await loadEnv(DatabaseEnvSchema)).DB_PATH).toBe('aus-der-umgebung.db');
  });

  it('loadEnv ohne Pflichtwert → EnvConfigError mit Feldname', async () => {
    await writeFile(path.join(dir, '.env'), 'NODE_ENV=development\n');
    process.env = { PATH: saved['PATH'] };
    await expect(loadEnv(DatabaseEnvSchema)).rejects.toThrow(/DB_PATH fehlt/);
  });
});
