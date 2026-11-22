import path from 'node:path';

/** DI-Token für den Pfad der SQLite-Datei (03 B4.4); Tests ersetzen ihn per `overrideProvider`. */
export const DB_PATH = 'DB_PATH';

/** SQLite im Arbeitsspeicher (e2e-Tests, 03 B4.4): immer leer, deshalb laufen dort die Migrationen beim Start. */
export const MEMORY_DB = ':memory:';

export function isMemoryDatabase(dbPath: string): boolean {
  return dbPath === MEMORY_DB;
}

/**
 * `DB_PATH` (Pflicht seit Schritt 11, `EnvSchema`, 03 B4.8) als absoluter Pfad: relative Angaben gelten ab dem
 * Arbeitsverzeichnis (bei `npm run …` also `api/`), `:memory:` bleibt. Einen Standard gibt es nicht mehr; die
 * Dev-DB `%LOCALAPPDATA%\wetter-heubach\weather.dev.db` steht als Beispiel in `.env.example`. Den Ordner legt
 * der TypeORM-Treiber beim Verbinden an.
 */
export function resolveDbPath(dbPath: string, cwd: string = process.cwd()): string {
  const configured = dbPath.trim();
  return isMemoryDatabase(configured) ? configured : path.resolve(cwd, configured);
}
