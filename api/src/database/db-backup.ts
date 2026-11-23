import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BUSY_TIMEOUT_MS } from './prepare-database';
import { isMemoryDatabase } from './db-path';
import { MIGRATIONS } from './migrations';

/**
 * Sicherung und Wiederherstellung der SQLite-Datei (Schritt 14c, 03 C4/C5), aufgerufen über `npm run db:backup`
 * und `npm run db:restore -- --from <datei>` (`db-cli.ts`).
 *
 * - **Konsistent trotz WAL und laufendem Nest:** Beide Wege schreiben nur über SQLite (`VACUUM INTO`), nie per
 *   Dateikopie. `VACUUM INTO` liest in einer Lesetransaktion, Nest darf dabei weiterschreiben.
 * - **Namen:** `<Name der DB ohne .db>-YYYY-MM-DDTHH-MM-SSZ.db` (UTC), für die Sammel-DB `weather.db` also
 *   `weather-2026-11-23T10-15-30Z.db`. Der Name der DB steckt im Muster, damit Sicherungen der Dev-DB
 *   (`weather.dev-…`) im selben Ordner die Aufbewahrung der Sammel-DB nicht berühren.
 * - **Aufbewahrung:** Nach einer Sicherung bleiben die neuesten `keep` Dateien, die **genau** diesem Muster
 *   entsprechen; alle anderen Dateien im Ordner bleiben unberührt (auch die Sicherungen vor einer
 *   Wiederherstellung, `…-before-restore-….db`).
 */

/** Abbruch von `db:backup`/`db:restore` mit Meldung; die Datenbank ist unverändert (Exit-Code 1). */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface BackupOptions {
  dbPath: string;
  backupDir: string;
  keep: number;
  now?: Date;
}

export interface BackupResult {
  file: string;
  integrity: 'ok';
  /** `COUNT(*)` aus `observation` in der Sicherung (`null`: Tabelle fehlt, DB nicht migriert). */
  observations: number | null;
  /** dasselbe in `DB_PATH`, unmittelbar vor der Sicherung gelesen (Nest kann danach noch geschrieben haben). */
  sourceObservations: number | null;
  /** Von der Aufbewahrung gelöschte Dateien (nur Namen). */
  deleted: string[];
  /** Anzahl der Sicherungen mit dem eigenen Muster danach. */
  kept: number;
}

export interface RestoreOptions {
  dbPath: string;
  from: string;
  backupDir: string;
  /** `--yes`: ohne Bestätigung nur Prüfung und Warnung, nichts wird geändert. */
  yes: boolean;
  env: NodeJS.ProcessEnv;
  now?: Date;
}

export interface DatabaseCheck {
  integrity: 'ok';
  observations: number | null;
  /** Namen der ausgeführten Migrationen (Tabelle `migrations` von TypeORM). */
  migrations: string[];
}

export interface RestoreResult {
  source: DatabaseCheck;
  /** Sicherung des Stands vor der Wiederherstellung (`null`: `DB_PATH` gab es nicht). */
  preRestoreBackup: string | null;
  restored: DatabaseCheck;
  /** Migrationen dieses Code-Stands, die in der wiederhergestellten DB fehlen (→ `npm run migration:run`). */
  pendingMigrations: string[];
}

/** Zeitstempel im Dateinamen: UTC ohne Doppelpunkte (Windows), `2026-11-23T10-15-30Z`. */
export function backupStamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
}

/** Name der DB ohne Endung `.db` (`weather.db` → `weather`, `weather.dev.db` → `weather.dev`). */
function baseNameOf(dbPath: string): string {
  return path.basename(dbPath).replace(/\.db$/i, '');
}

/** Dateiname einer Sicherung von `db:backup`. */
export function backupFileName(dbPath: string, now: Date): string {
  return `${baseNameOf(dbPath)}-${backupStamp(now)}.db`;
}

/** Genau das Muster von `backupFileName`; nur solche Dateien löscht die Aufbewahrung. */
export function backupFilePattern(dbPath: string): RegExp {
  const base = baseNameOf(dbPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${base}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z\\.db$`);
}

/** Sicherung vor `db:restore`; fällt absichtlich nicht unter das Muster (bleibt, bis man sie selbst löscht). */
export function preRestoreFileName(dbPath: string, now: Date): string {
  return `${baseNameOf(dbPath)}-before-restore-${backupStamp(now)}.db`;
}

/** Standard für `BACKUP_DIR`: Ordner `backups` neben der DB (`%LOCALAPPDATA%\wetter-heubach\backups`). */
export function defaultBackupDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups');
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function openDb(file: string, readonly = false): Database.Database {
  return new Database(file, { fileMustExist: true, readonly, timeout: BUSY_TIMEOUT_MS });
}

function hasTable(db: Database.Database, name: string): boolean {
  return db.prepare(`SELECT 1 FROM "sqlite_master" WHERE "type" = 'table' AND "name" = ?`).get(name) !== undefined;
}

function countObservations(db: Database.Database): number | null {
  return hasTable(db, 'observation') ? (db.prepare(`SELECT COUNT(*) FROM "observation"`).pluck().get() as number) : null;
}

/**
 * `PRAGMA integrity_check` (muss genau `ok` liefern), `COUNT(*)` aus `observation` und die Migrationen.
 * `requireMigrations`: ohne Tabelle `migrations` ist die Datei keine DB dieser App → Abbruch.
 */
export function checkDatabaseFile(file: string, options: { label: string; requireMigrations: boolean }): DatabaseCheck {
  let db: Database.Database | null = null;
  try {
    db = openDb(file, true);
    const result = db.prepare('PRAGMA integrity_check').pluck().all() as string[];
    if (result.length !== 1 || result[0] !== 'ok') {
      throw new BackupError(`${options.label} ${file}: integrity_check meldet Fehler: ${result.slice(0, 5).join('; ')}`);
    }
    const migrations = hasTable(db, 'migrations')
      ? (db.prepare(`SELECT "name" FROM "migrations" ORDER BY "id"`).pluck().all() as string[])
      : null;
    if (migrations === null && options.requireMigrations) {
      throw new BackupError(`${options.label} ${file} hat keine Tabelle "migrations" (keine Datenbank des Wetter-Dashboards).`);
    }
    return { integrity: 'ok', observations: countObservations(db), migrations: migrations ?? [] };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(`${options.label} ${file} ist beschädigt oder keine SQLite-Datenbank: ${(error as Error).message}`);
  } finally {
    db?.close();
  }
}

/**
 * Hat ein anderer Prozess (Nest, CLI, DB-Browser) `dbPath` offen? Im WAL-Modus hält jede offene Verbindung
 * eine Sperre auf der Datei; der Wechsel nach `journal_mode = DELETE` braucht dagegen die **alleinige**
 * Sperre und scheitert sofort (`timeout: 0`) mit `SQLITE_BUSY`, solange eine zweite Verbindung besteht.
 * Gelingt er, wird gleich wieder `WAL` gesetzt (Stand wie vorher). Beim Schließen der letzten Verbindung
 * schreibt SQLite die WAL-Datei zurück und löscht `-wal` und `-shm`. Das prüft unabhängig vom Port.
 * Ergebnis: `COUNT(*)` aus `observation` (für den Bericht).
 */
export function assertNotInUse(dbPath: string): number | null {
  const db = new Database(dbPath, { fileMustExist: true, timeout: 0 });
  try {
    let mode: unknown;
    try {
      mode = db.pragma('journal_mode = DELETE', { simple: true });
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_BUSY') mode = 'busy';
      else throw error;
    }
    if (mode !== 'delete') {
      throw new BackupError(
        `${dbPath} ist gerade von einem anderen Prozess geöffnet (läuft Nest noch?). Nest stoppen (Strg+C im ` +
          `Fenster von Nest) und erneut aufrufen. Die Datenbank bleibt unverändert.`,
      );
    }
    db.pragma('journal_mode = WAL');
    return countObservations(db);
  } finally {
    db.close();
  }
}

/** `VACUUM INTO` von `source` nach `target` (darf es noch nicht geben); liest konsistent, auch während Nest schreibt. */
function vacuumInto(source: string, target: string, readonly: boolean): void {
  const db = openDb(source, readonly);
  try {
    db.exec(`VACUUM INTO ${sqlText(target)}`);
  } finally {
    db.close();
  }
}

/** Aufbewahrung: die neuesten `keep` Dateien mit genau dem Muster bleiben; der Name ist chronologisch sortierbar. */
async function pruneBackups(dbPath: string, backupDir: string, keep: number): Promise<{ deleted: string[]; kept: number }> {
  const pattern = backupFilePattern(dbPath);
  const own = (await readdir(backupDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => entry.name)
    .sort();
  const deleted = own.slice(0, Math.max(0, own.length - keep));
  for (const name of deleted) await rm(path.join(backupDir, name));
  return { deleted, kept: own.length - deleted.length };
}

/** Sicherung nach `<datei>.partial`, Prüfung, dann Umbenennen: Eine abgebrochene Sicherung zählt nie mit. */
async function createCheckedBackup(dbPath: string, target: string, label: string): Promise<DatabaseCheck> {
  if (existsSync(target)) {
    throw new BackupError(`${target} gibt es schon (zwei Sicherungen in derselben Sekunde?). In einer Sekunde erneut aufrufen.`);
  }
  const partial = `${target}.partial`;
  await rm(partial, { force: true });
  try {
    vacuumInto(dbPath, partial, false);
    const check = checkDatabaseFile(partial, { label, requireMigrations: false });
    await rename(partial, target);
    return check;
  } catch (error) {
    await rm(partial, { force: true });
    if (error instanceof BackupError) throw error;
    throw new BackupError(`${label} nach ${target} fehlgeschlagen: ${(error as Error).message}`);
  }
}

/**
 * `npm run db:backup`: sichert `DB_PATH` per `VACUUM INTO` nach `backupDir`, prüft die Sicherung
 * (`integrity_check` = `ok`, `COUNT(*)` aus `observation`) und löscht danach ältere eigene Sicherungen über
 * `keep` hinaus. Ohne Datei `DB_PATH` Abbruch. Läuft auch, während Nest die DB offen hat.
 */
export async function runBackup(options: BackupOptions): Promise<BackupResult> {
  const { dbPath, backupDir, keep } = options;
  if (isMemoryDatabase(dbPath)) throw new BackupError('db:backup braucht eine Datei als DB_PATH.');
  if (!existsSync(dbPath)) throw new BackupError(`${dbPath} gibt es nicht; es gibt nichts zu sichern.`);
  if (!Number.isInteger(keep) || keep < 1) throw new BackupError('BACKUP_KEEP muss eine ganze Zahl ab 1 sein.');
  const now = options.now ?? new Date();

  await mkdir(backupDir, { recursive: true });
  const file = path.join(backupDir, backupFileName(dbPath, now));
  let sourceObservations: number | null;
  try {
    const source = openDb(dbPath, true);
    try {
      sourceObservations = countObservations(source);
    } finally {
      source.close();
    }
  } catch (error) {
    throw new BackupError(`${dbPath} lässt sich nicht lesen: ${(error as Error).message}`);
  }
  const check = await createCheckedBackup(dbPath, file, 'Sicherung');
  const pruned = await pruneBackups(dbPath, backupDir, keep);
  return { file, integrity: check.integrity, observations: check.observations, sourceObservations, ...pruned };
}

/** Text für die Warnung ohne `--yes`. */
function describeRestore(options: RestoreOptions, source: DatabaseCheck, current: number | null | undefined): string {
  const target = current === undefined ? 'gibt es noch nicht' : `observation ${current ?? '-'} Zeilen`;
  const production = options.env['NODE_ENV'] === 'production' ? ' ACHTUNG: NODE_ENV=production.' : '';
  return (
    `db:restore ersetzt ${options.dbPath} (${target}) durch ${options.from} (observation ${source.observations ?? '-'} ` +
    `Zeilen, ${source.migrations.length} Migration(en)). Der aktuelle Stand wird vorher nach ${options.backupDir} ` +
    `gesichert.${production} Nichts wurde geändert. Zum Ausführen erneut mit --yes aufrufen.`
  );
}

/**
 * `npm run db:restore -- --from <datei> --yes`:
 * 1. Quelle prüfen (`integrity_check` = `ok`, Tabelle `migrations`); sonst Abbruch.
 * 2. Ist `DB_PATH` von einem anderen Prozess geöffnet (Nest), Abbruch (`assertNotInUse`).
 * 3. Ohne `--yes` (auch und gerade bei `NODE_ENV=production`) nur Warnung, Abbruch ohne Änderung.
 * 4. Aktuellen Stand sichern (`…-before-restore-<Zeit>.db` in `backupDir`, geprüft).
 * 5. Quelle per `VACUUM INTO` in eine Zwischendatei neben `DB_PATH`, prüfen, erneut Schritt 2, `-wal`/`-shm`
 *    entfernen und die Zwischendatei über `DB_PATH` umbenennen (atomar; unter Windows scheitert das außerdem,
 *    wenn die Datei doch geöffnet ist).
 * 6. `integrity_check` auf `DB_PATH`, `COUNT(*)`, fehlende Migrationen melden.
 */
export async function runRestore(options: RestoreOptions): Promise<RestoreResult> {
  const { dbPath, from, backupDir } = options;
  if (isMemoryDatabase(dbPath)) throw new BackupError('db:restore braucht eine Datei als DB_PATH.');
  if (samePath(from, dbPath)) throw new BackupError('--from ist DB_PATH selbst; bitte eine Sicherung angeben.');
  if (!existsSync(from)) throw new BackupError(`Quelle ${from} gibt es nicht. Die Datenbank bleibt unverändert.`);
  const now = options.now ?? new Date();

  const source = checkDatabaseFile(from, { label: 'Quelle', requireMigrations: true });
  const targetExists = existsSync(dbPath);
  const current = targetExists ? assertNotInUse(dbPath) : undefined;
  if (!options.yes) throw new BackupError(describeRestore(options, source, current));

  let preRestoreBackup: string | null = null;
  if (targetExists) {
    await mkdir(backupDir, { recursive: true });
    preRestoreBackup = path.join(backupDir, preRestoreFileName(dbPath, now));
    await createCheckedBackup(dbPath, preRestoreBackup, 'Sicherung vor der Wiederherstellung');
  }

  await mkdir(path.dirname(dbPath), { recursive: true });
  const staged = `${dbPath}.restore-${backupStamp(now)}.tmp`;
  await rm(staged, { force: true });
  try {
    vacuumInto(from, staged, true);
    checkDatabaseFile(staged, { label: 'Zwischendatei', requireMigrations: true });
    if (targetExists) assertNotInUse(dbPath);
    await rm(`${dbPath}-wal`, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
    await rename(staged, dbPath);
  } catch (error) {
    await rm(staged, { force: true });
    if (error instanceof BackupError) throw error;
    throw new BackupError(`Wiederherstellung abgebrochen, ${dbPath} ist unverändert: ${(error as Error).message}`);
  }

  const restored = checkDatabaseFile(dbPath, { label: 'Wiederhergestellte DB', requireMigrations: true });
  // Wie im Betrieb (prepareDatabase): WAL. VACUUM INTO legt die Datei im Rollback-Modus an. Erst nach der
  // Prüfung (nur lesend), damit beim Schließen dieser letzten Verbindung keine `-wal`/`-shm` liegen bleiben.
  const db = openDb(dbPath);
  try {
    db.pragma('journal_mode = WAL');
  } finally {
    db.close();
  }
  const pendingMigrations = MIGRATIONS.map(migration => migration.name).filter(name => !restored.migrations.includes(name));
  return { source, preRestoreBackup, restored, pendingMigrations };
}
