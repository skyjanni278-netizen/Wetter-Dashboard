import { existsSync } from 'node:fs';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { SystemClock } from './common/clock';
import { loadEnv } from './config/config';
import { DatabaseEnvSchema, EnvConfigError, OpenMeteoEnvSchema } from './config/env.schema';
import { dataSourceOptions } from './database/database-options';
import { isMemoryDatabase, resolveDbPath } from './database/db-path';
import { DailyForecast } from './forecasts/daily-forecast.entity';
import { TypeOrmForecastStore } from './forecasts/typeorm-forecast.store';
import { Import } from './imports/import.entity';
import { ImportAlreadyRunningError } from './imports/import.store';
import { TypeOrmImportStore } from './imports/typeorm-import.store';
import { formatDstCheck, runDstCheck } from './legacy/legacy-dst-check';
import { checkLegacyArchive, LegacyImporter } from './legacy/legacy-import';
import type { LegacyImportReport } from './legacy/legacy-import';
import { Observation } from './observations/observation.entity';
import { TypeOrmObservationStore } from './observations/typeorm-observation.store';
import { ADMIN_INITIAL_PASSWORD, AdminCommandError, createAdmin, setAdminPassword } from './users/admin-commands';
import { PasswordInputAborted, promptNewPassword } from './users/password-input';
import { User } from './users/user.entity';
import { UsernameSchema } from './users/username.schema';
import { UsersService } from './users/users.service';
import { OpenMeteoClient } from './weather-provider/open-meteo.client';

/**
 * Befehle für den Betrieb (03 B2.7, US15, B4.6), aufgerufen über `npm run cli -- <befehl>` (nach `build`):
 *
 *   node dist/cli.js import:legacy --dir <pfad> [--dry-run]
 *   node dist/cli.js legacy:dst-check --dir <pfad>
 *   node dist/cli.js admin:create --username <name>        (Passwort aus ADMIN_INITIAL_PASSWORD oder verdeckt von stdin)
 *   node dist/cli.js admin:set-password --username <name>  (Passwort verdeckt von stdin)
 *
 * Konfiguration wie die App aus `api/.env` und der Umgebung (Vorrang), aber je Befehl nur das Nötige (Teilschemas
 * in `config/env.schema.ts`, **kein** `JWT_SECRET`): `import:legacy` und `admin:*` brauchen `NODE_ENV` und
 * `DB_PATH` (Pflicht, die Datei muss migriert sein: `npm run migration:run`), `import:legacy --dry-run` nichts,
 * `legacy:dst-check` nur die Open-Meteo-Werte (mit Standard). Fehlt ein Wert → Meldung mit Feldname, Exit-Code 1.
 * Kein Nest-Kontext: Es laufen weder Scheduler (`SCHEDULER_ENABLED` spielt keine Rolle) noch der Start-Hook,
 * der laufende Importe auf `INTERRUPTED` setzt, und kein HTTP (kein Token nötig); die Stores sind dieselben
 * wie in der App. Exit-Code 0 bei Erfolg, 1 bei Fehlern in den Daten, beim Schreiben oder Abbruch (z. B. es
 * gibt schon einen Admin, Passwort zu kurz), 2 bei falschem Aufruf.
 */
type ArchiveCommand = 'import:legacy' | 'legacy:dst-check';
type AdminCommand = 'admin:create' | 'admin:set-password';

type CliArgs =
  | { command: ArchiveCommand; dir: string; dryRun: boolean }
  | { command: AdminCommand; username: string };

const USAGE =
  'Aufruf: cli import:legacy --dir <pfad> [--dry-run] | cli legacy:dst-check --dir <pfad> | ' +
  'cli admin:create --username <name> | cli admin:set-password --username <name>';

class UsageError extends Error {}

function parseAdminArgs(command: AdminCommand, rest: readonly string[]): CliArgs {
  let raw: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--username' && rest[i + 1]) raw = rest[++i];
    else if (arg.startsWith('--username=')) raw = arg.slice('--username='.length);
    else throw new UsageError(`Unbekanntes Argument "${arg}". ${USAGE}`);
  }
  if (raw === null) throw new UsageError(`--username fehlt. ${USAGE}`);
  const username = UsernameSchema.safeParse(raw);
  if (!username.success) throw new UsageError(`--username: ${username.error.issues[0]?.message ?? 'ungültig'}`);
  return { command, username: username.data };
}

function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command === 'admin:create' || command === 'admin:set-password') return parseAdminArgs(command, rest);
  if (command !== 'import:legacy' && command !== 'legacy:dst-check') throw new UsageError(USAGE);
  let dir: string | null = null;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--dir' && rest[i + 1]) dir = rest[++i];
    else if (arg.startsWith('--dir=')) dir = arg.slice('--dir='.length);
    else if (arg === '--dry-run' && command === 'import:legacy') dryRun = true;
    else throw new UsageError(`Unbekanntes Argument "${arg}". ${USAGE}`);
  }
  if (!dir) throw new UsageError(`--dir fehlt. ${USAGE}`);
  return { command, dir: path.resolve(dir), dryRun };
}

function printReport(report: LegacyImportReport): void {
  const { files } = report;
  console.log(`import:legacy${report.dryRun ? ' (Probelauf, nichts geschrieben)' : ''}: ${report.dir}`);
  console.log(`${files.valid} Dateien gültig, ${files.invalid} Fehler`);
  for (const error of report.invalidFiles) console.log(`  ungültig: ${error.file}: ${error.message}`);
  console.log(`Regel: ${report.rule}; ${report.hours} Stunden aus gültigen Monaten; Vorhersage: ${report.forecastDays} Tag(e)`);
  console.log(
    `Herkunft: ${Object.entries(report.bySource)
      .map(([source, n]) => `${source} ${n.days} Tage / ${n.hours} Stunden`)
      .join(', ')}`,
  );
  if (report.skippedMonths.length > 0) console.log(`Nicht geschrieben: ${report.skippedMonths.join(', ')}`);
  const listed = new Set(['LEGACY_TIME_RULE', 'LEGACY_SOURCES', 'LEGACY_INVALID_FILE']);
  for (const warning of report.warnings.filter(w => !listed.has(w.code))) {
    console.log(`  Warnung ${warning.code}: ${warning.message}`);
  }
  if (!report.dryRun) {
    const c = report.counts!;
    console.log(
      `Import ${report.importId} (kind = legacy): ${report.status}; inserted = ${c.inserted}, updated = ${c.updated}, ` +
        `unchanged = ${c.unchanged}, skippedCorrected = ${c.skippedCorrected}`,
    );
    if (report.error) console.log(`Fehler ${report.error.code}: ${report.error.message}`);
  }
}

/** Nachprüfung (03 B2.7 Schritt 9) direkt in der Tabelle. */
async function printVerification(dataSource: DataSource): Promise<void> {
  const [total]: { n: number; days: number; first: string | null; last: string | null }[] = await dataSource.query(
    `SELECT COUNT(*) AS "n", COUNT(DISTINCT "local_date") AS "days", MIN("local_date") AS "first", MAX("local_date") AS "last"
     FROM "observation" WHERE "location_id" = 1`,
  );
  console.log(
    `Nachprüfung: COUNT(*) = ${total.n}, COUNT(DISTINCT local_date) = ${total.days} (${total.first ?? '-'} bis ${total.last ?? '-'})`,
  );
  const dst: { local_date: string; n: number }[] = await dataSource.query(
    `SELECT "local_date", COUNT(*) AS "n" FROM "observation"
     WHERE "location_id" = 1 AND "local_date" IN ('2025-03-30', '2025-10-26', '2026-03-29', '2026-10-25')
     GROUP BY "local_date" ORDER BY "local_date"`,
  );
  if (dst.length > 0) console.log(`DST-Tage: ${dst.map(d => `${d.local_date} ${d.n} Stunden`).join(', ')}`);
}

type ArchiveArgs = Extract<CliArgs, { command: ArchiveCommand }>;
type AdminArgs = Extract<CliArgs, { command: AdminCommand }>;

async function openTarget(dbPath: string, command: CliArgs['command']): Promise<DataSource> {
  if (isMemoryDatabase(dbPath)) throw new Error(`${command} braucht eine Datei als DB_PATH.`);
  if (!existsSync(dbPath)) throw new Error(`${dbPath} gibt es nicht. Zuerst npm run migration:run.`);
  const dataSource = new DataSource({ ...dataSourceOptions(dbPath), migrationsRun: false });
  await dataSource.initialize();
  if (await dataSource.showMigrations()) {
    await dataSource.destroy();
    throw new Error('Es gibt offene Migrationen. Zuerst npm run migration:run.');
  }
  return dataSource;
}

async function importLegacy(args: ArchiveArgs): Promise<number> {
  if (!existsSync(args.dir)) throw new Error(`Ordner ${args.dir} gibt es nicht.`);
  if (args.dryRun) {
    // Probelauf ohne Datenbank: weder Datei noch Import-Eintrag entstehen (US15-1); braucht keinen Wert aus .env.
    const report = await checkLegacyArchive(args.dir);
    printReport(report);
    return report.files.invalid === 0 ? 0 : 1;
  }

  const env = await loadEnv(DatabaseEnvSchema);
  const clock = new SystemClock();
  const dbPath = resolveDbPath(env.DB_PATH);
  const dataSource = await openTarget(dbPath, args.command);
  try {
    console.log(`Datenbank: ${dbPath}`);
    const report = await new LegacyImporter({
      imports: new TypeOrmImportStore(dataSource.getRepository(Import)),
      observations: new TypeOrmObservationStore(dataSource.getRepository(Observation), clock),
      forecasts: new TypeOrmForecastStore(dataSource.getRepository(DailyForecast)),
      clock,
    }).run({ dir: args.dir, dryRun: false });
    printReport(report);
    await printVerification(dataSource);
    return report.status === 'succeeded' ? 0 : 1;
  } finally {
    await dataSource.destroy();
  }
}

async function dstCheck(args: ArchiveArgs): Promise<number> {
  const env = await loadEnv(OpenMeteoEnvSchema);
  const client = new OpenMeteoClient(undefined, undefined, {
    forecastUrl: env.OPEN_METEO_FORECAST_URL,
    archiveUrl: env.OPEN_METEO_ARCHIVE_URL,
    timeoutMs: env.OPEN_METEO_TIMEOUT_MS,
  });
  const result = await runDstCheck(args.dir, client);
  for (const line of formatDstCheck(result)) console.log(line);
  return result.rule ? 0 : 1;
}

/**
 * `admin:create` / `admin:set-password` (03 B4.6) gegen `DB_PATH`. Das Passwort kommt verdeckt von stdin (im
 * Terminal zweimal) oder bei `admin:create` einmalig aus `ADMIN_INITIAL_PASSWORD`; Abfragen gehen nach stderr.
 * `ADMIN_INITIAL_PASSWORD` ist ein Einmalwert nur für die CLI (nicht im `EnvSchema` der App, 03 B4.8); er kommt
 * über dasselbe Teilschema aus Umgebung bzw. `.env` und wird nie ausgegeben.
 */
async function adminCommand(args: AdminArgs): Promise<number> {
  const env = await loadEnv(DatabaseEnvSchema.extend({ [ADMIN_INITIAL_PASSWORD]: z.string().optional() }));
  const dbPath = resolveDbPath(env.DB_PATH);
  const dataSource = await openTarget(dbPath, args.command);
  try {
    console.log(`Datenbank: ${dbPath}`);
    const deps = {
      users: new UsersService(dataSource.getRepository(User)),
      env: { [ADMIN_INITIAL_PASSWORD]: env[ADMIN_INITIAL_PASSWORD] },
      prompt: () => promptNewPassword({ input: process.stdin, output: process.stderr }),
      now: () => new Date(),
      log: (line: string) => console.log(line),
    };
    if (args.command === 'admin:create') await createAdmin(args.username, deps);
    else await setAdminPassword(args.username, deps);
    return 0;
  } finally {
    await dataSource.destroy();
    // Eine Umleitung auf stdin hielte den Prozess sonst am Leben.
    process.stdin.destroy();
  }
}

/**
 * Führt einen Befehl aus und liefert den Exit-Code (0 Erfolg, 1 Fehler, 2 falscher Aufruf); exportiert für
 * `cli.spec.ts`. Gibt nur über `console` aus und setzt `process.exitCode` nicht selbst.
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  try {
    if ('username' in args) return await adminCommand(args);
    return args.command === 'import:legacy' ? await importLegacy(args) : await dstCheck(args);
  } catch (error) {
    const prefix =
      error instanceof ImportAlreadyRunningError
        ? 'Abbruch (R19)'
        : error instanceof AdminCommandError || error instanceof PasswordInputAborted || error instanceof EnvConfigError
          ? 'Abbruch'
          : 'Fehler';
    console.error(`${prefix}: ${(error as Error).message}`);
    return 1;
  }
}

// Nur beim Aufruf als Programm (`node dist/cli.js`), nicht beim Import im Test.
if (require.main === module) {
  void main().then(code => {
    process.exitCode = code;
  });
}
