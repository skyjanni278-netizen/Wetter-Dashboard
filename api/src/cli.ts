import { existsSync } from 'node:fs';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { SystemClock } from './common/clock';
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
import { OpenMeteoClient } from './weather-provider/open-meteo.client';

/**
 * Befehle für den Betrieb (03 B2.7, US15), aufgerufen über `npm run cli -- <befehl>` (nach `build`):
 *
 *   node dist/cli.js import:legacy --dir <pfad> [--dry-run]
 *   node dist/cli.js legacy:dst-check --dir <pfad>
 *
 * Ziel des Imports ist `DB_PATH` (ohne Angabe die Dev-DB); die Datei muss migriert sein (`npm run migration:run`).
 * Kein Nest-Kontext: Es laufen weder Scheduler (`SCHEDULER_ENABLED` spielt keine Rolle) noch der Start-Hook,
 * der laufende Importe auf `INTERRUPTED` setzt; die Stores sind dieselben wie in der App.
 * Exit-Code 0 bei Erfolg, 1 bei Fehlern in den Daten oder beim Schreiben, 2 bei falschem Aufruf.
 */
type Command = 'import:legacy' | 'legacy:dst-check';

interface CliArgs {
  command: Command;
  dir: string;
  dryRun: boolean;
}

const USAGE = 'Aufruf: cli import:legacy --dir <pfad> [--dry-run] | cli legacy:dst-check --dir <pfad>';

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
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

async function openTarget(dbPath: string): Promise<DataSource> {
  if (isMemoryDatabase(dbPath)) throw new Error('import:legacy braucht eine Datei als DB_PATH.');
  if (!existsSync(dbPath)) throw new Error(`${dbPath} gibt es nicht. Zuerst npm run migration:run.`);
  const dataSource = new DataSource({ ...dataSourceOptions(dbPath), migrationsRun: false });
  await dataSource.initialize();
  if (await dataSource.showMigrations()) {
    await dataSource.destroy();
    throw new Error('Es gibt offene Migrationen. Zuerst npm run migration:run.');
  }
  return dataSource;
}

async function importLegacy(args: CliArgs): Promise<number> {
  if (!existsSync(args.dir)) throw new Error(`Ordner ${args.dir} gibt es nicht.`);
  if (args.dryRun) {
    // Probelauf ohne Datenbank: weder Datei noch Import-Eintrag entstehen (US15-1).
    const report = await checkLegacyArchive(args.dir);
    printReport(report);
    return report.files.invalid === 0 ? 0 : 1;
  }

  const clock = new SystemClock();
  const dbPath = resolveDbPath();
  const dataSource = await openTarget(dbPath);
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

async function dstCheck(args: CliArgs): Promise<number> {
  const result = await runDstCheck(args.dir, new OpenMeteoClient());
  for (const line of formatDstCheck(result)) console.log(line);
  return result.rule ? 0 : 1;
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
    return args.command === 'import:legacy' ? await importLegacy(args) : await dstCheck(args);
  } catch (error) {
    const prefix = error instanceof ImportAlreadyRunningError ? 'Abbruch (R19)' : 'Fehler';
    console.error(`${prefix}: ${(error as Error).message}`);
    return 1;
  }
}

void main().then(code => {
  process.exitCode = code;
});
