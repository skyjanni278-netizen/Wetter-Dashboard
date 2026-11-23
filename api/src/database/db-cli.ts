import path from 'node:path';
import { loadEnv } from '../config/config';
import { BackupEnvSchema, EnvConfigError, SeedEnvSchema } from '../config/env.schema';
import { CollectedDataError, FORCE_FLAG } from './collected-data';
import { BackupError, defaultBackupDir, runBackup, runRestore } from './db-backup';
import type { BackupResult, RestoreResult } from './db-backup';
import { runReset, runSeed } from './db-maintenance';
import { resolveDbPath } from './db-path';
import type { DevAdminResult } from './seeds/dev-admin';

/**
 * Wartung der Datenbank (03 B4.4), aufgerufen über `npm run db:seed`, `db:reset`, `db:backup` bzw. `db:restore`
 * (nach `build`):
 *
 *   node dist/database/db-cli.js seed    [--fixture <name>] [--force-delete-collected-data]
 *   node dist/database/db-cli.js reset   [--fixture <name>] [--force-delete-collected-data]
 *   node dist/database/db-cli.js backup
 *   node dist/database/db-cli.js restore --from <datei> [--yes]
 *
 * Konfiguration aus `api/.env` und der Umgebung, **kein** `JWT_SECRET`: `seed`/`reset` mit `SeedEnvSchema`
 * (`NODE_ENV`, `DB_PATH` Pflicht, `DEV_ADMIN_PASSWORD` optional), `backup`/`restore` mit `BackupEnvSchema`
 * (dazu `BACKUP_DIR`, `BACKUP_KEEP`, Schritt 14c). Ziel ist `DB_PATH`. Mit `DEV_ADMIN_PASSWORD` entsteht
 * beim Seed der Dev-Admin `admin` (Schritt 10); ohne die Variable kein Admin, nur ein Hinweis. Exit-Code 0 bei
 * Erfolg, 1 bei Abbruch oder Fehler (die DB ist dann unverändert), 2 bei falschem Aufruf.
 */
type CliArgs =
  | { command: 'seed' | 'reset'; fixture: string | null; force: boolean }
  | { command: 'backup' }
  | { command: 'restore'; from: string; yes: boolean };

const USAGE =
  `Aufruf: db-cli <seed|reset> [--fixture <name>] [${FORCE_FLAG}] | db-cli backup | ` +
  'db-cli restore --from <datei> [--yes]';

function parseRestoreArgs(rest: readonly string[]): CliArgs {
  let from: string | null = null;
  let yes = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--yes') yes = true;
    else if (arg === '--from' && rest[i + 1]) from = rest[++i];
    else if (arg.startsWith('--from=')) from = arg.slice('--from='.length);
    else throw new Error(`Unbekanntes Argument "${arg}". ${USAGE}`);
  }
  if (!from) throw new Error(`--from fehlt. ${USAGE}`);
  return { command: 'restore', from, yes };
}

function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command === 'backup') {
    if (rest.length > 0) throw new Error(`Unbekanntes Argument "${rest[0]}". ${USAGE}`);
    return { command };
  }
  if (command === 'restore') return parseRestoreArgs(rest);
  if (command !== 'seed' && command !== 'reset') throw new Error(USAGE);
  const args: CliArgs = { command, fixture: null, force: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === FORCE_FLAG) args.force = true;
    else if (arg === '--fixture' && rest[i + 1]) args.fixture = rest[++i];
    else if (arg.startsWith('--fixture=')) args.fixture = arg.slice('--fixture='.length);
    else throw new Error(`Unbekanntes Argument "${arg}". ${USAGE}`);
  }
  return args;
}

/** Zeile im Log zum Dev-Admin (03 B4.4). */
function describeDevAdmin(result: DevAdminResult): string {
  if (result.status === 'skipped') return `Hinweis: ${result.reason}`;
  return `Dev-Admin "${result.username}" ${result.status === 'created' ? 'angelegt' : 'Passwort neu gesetzt'} (Passwort aus DEV_ADMIN_PASSWORD)`;
}

function rows(value: number | null): string {
  return value === null ? '- (Tabelle fehlt)' : `${value}`;
}

function printBackup(result: BackupResult, keep: number): void {
  console.log(`db:backup: Sicherung ${result.file}`);
  console.log(`db:backup: integrity_check ${result.integrity}, observation ${rows(result.observations)} Zeilen (Quelle ${rows(result.sourceObservations)})`);
  console.log(
    `db:backup: Aufbewahrung ${keep}: ${result.kept} Sicherung(en) vorhanden, ` +
      (result.deleted.length ? `gelöscht: ${result.deleted.join(', ')}` : 'keine gelöscht'),
  );
}

function printRestore(result: RestoreResult, dbPath: string, from: string): void {
  console.log(`db:restore: Quelle ${from}: integrity_check ${result.source.integrity}, observation ${rows(result.source.observations)} Zeilen`);
  console.log(`db:restore: Sicherung vorher ${result.preRestoreBackup ?? '(keine, DB_PATH gab es nicht)'}`);
  console.log(`db:restore: ${dbPath} wiederhergestellt: integrity_check ${result.restored.integrity}, observation ${rows(result.restored.observations)} Zeilen`);
  if (result.pendingMigrations.length) {
    console.log(`db:restore: Hinweis: ${result.pendingMigrations.length} offene Migration(en), vor dem Start npm run migration:run`);
  }
}

async function runBackupCommand(args: Extract<CliArgs, { command: 'backup' | 'restore' }>): Promise<void> {
  const config = await loadEnv(BackupEnvSchema);
  const dbPath = resolveDbPath(config.DB_PATH);
  const backupDir = config.BACKUP_DIR ? path.resolve(config.BACKUP_DIR) : defaultBackupDir(dbPath);
  if (args.command === 'backup') {
    printBackup(await runBackup({ dbPath, backupDir, keep: config.BACKUP_KEEP }), config.BACKUP_KEEP);
    return;
  }
  const from = path.resolve(args.from);
  const result = await runRestore({ dbPath, from, backupDir, yes: args.yes, env: { NODE_ENV: config.NODE_ENV } });
  printRestore(result, dbPath, from);
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  try {
    if (args.command === 'backup' || args.command === 'restore') {
      await runBackupCommand(args);
      return 0;
    }
    const label = args.fixture ? `Fixture "${args.fixture}"` : 'Dev-Seed';
    const config = await loadEnv(SeedEnvSchema);
    const dbPath = resolveDbPath(config.DB_PATH);
    const env = { NODE_ENV: config.NODE_ENV, DEV_ADMIN_PASSWORD: config.DEV_ADMIN_PASSWORD };
    if (args.command === 'seed') {
      const seed = await runSeed({ dbPath, fixture: args.fixture, force: args.force, env });
      console.log(`db:seed: ${label} in ${dbPath}: ${seed.observations} Stunden, ${seed.imports} Import(e), ` +
        `${seed.forecastDays} Vorhersagetag(e), ${seed.corrections} Korrektur(en); Tage ${seed.days[0] ?? '-'} bis ${seed.days[seed.days.length - 1] ?? '-'}`);
      console.log(`db:seed: ${describeDevAdmin(seed.devAdmin)}`);
    } else {
      const result = await runReset({ dbPath, fixture: args.fixture, force: args.force, env });
      console.log(`db:reset: Sicherung ${result.backupPath ?? '(keine, Datei gab es nicht)'}`);
      console.log(`db:reset: ${dbPath} neu angelegt, Migrationen ausgeführt, ${label}: ${result.seed.observations} Stunden, ${result.seed.corrections} Korrektur(en), ` +
        `Tage ${result.seed.days[0] ?? '-'} bis ${result.seed.days[result.seed.days.length - 1] ?? '-'}`);
      console.log(`db:reset: ${describeDevAdmin(result.seed.devAdmin)}`);
    }
    return 0;
  } catch (error) {
    const prefix =
      error instanceof CollectedDataError || error instanceof EnvConfigError || error instanceof BackupError ? 'Abbruch' : 'Fehler';
    console.error(`${prefix}: ${(error as Error).message}`);
    return 1;
  }
}

void main().then(code => {
  process.exitCode = code;
});
