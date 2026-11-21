import os from 'node:os';
import path from 'node:path';

/** DI-Token für den Pfad der SQLite-Datei (03 B4.4); Tests ersetzen ihn per `overrideProvider`. */
export const DB_PATH = 'DB_PATH';

/** SQLite im Arbeitsspeicher (e2e-Tests, 03 B4.4): immer leer, deshalb laufen dort die Migrationen beim Start. */
export const MEMORY_DB = ':memory:';

/** Ordner unter `%LOCALAPPDATA%` für beide Datenbanken der Entwicklung (03 B4.4: auf C:, nicht auf der USB-Platte). */
export const DB_DIR_NAME = 'wetter-heubach';

/**
 * Standard ist die **Dev-DB** (Seeds, Fixtures, `db:reset`). Die Sammel-DB `weather.db` nimmt ab der
 * Übergabe des Schedulers (Schritt 9c) die echten Daten auf und wird nur über `DB_PATH` gewählt.
 */
export const DEV_DB_FILE = 'weather.dev.db';

export function isMemoryDatabase(dbPath: string): boolean {
  return dbPath === MEMORY_DB;
}

/** `%LOCALAPPDATA%` (Windows) bzw. ein gleichwertiger Ordner im Home-Verzeichnis. */
function localAppData(env: NodeJS.ProcessEnv): string {
  const configured = env['LOCALAPPDATA']?.trim();
  return configured ? configured : path.join(os.homedir(), 'AppData', 'Local');
}

/**
 * Übergangsweise direkt aus `process.env` (Schritt 11: `EnvSchema`, dann Pflicht): `DB_PATH` oder die
 * Dev-DB `%LOCALAPPDATA%\wetter-heubach\weather.dev.db`. Relative Angaben gelten ab dem Arbeitsverzeichnis.
 * Den Ordner legt der TypeORM-Treiber beim Verbinden an.
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  const configured = env['DB_PATH']?.trim();
  if (configured) return isMemoryDatabase(configured) ? configured : path.resolve(cwd, configured);
  return path.join(localAppData(env), DB_DIR_NAME, DEV_DB_FILE);
}
