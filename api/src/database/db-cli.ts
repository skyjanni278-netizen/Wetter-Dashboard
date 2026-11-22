import { loadEnv } from '../config/config';
import { EnvConfigError, SeedEnvSchema } from '../config/env.schema';
import { CollectedDataError, FORCE_FLAG } from './collected-data';
import { runReset, runSeed } from './db-maintenance';
import { resolveDbPath } from './db-path';
import type { DevAdminResult } from './seeds/dev-admin';

/**
 * Wartung der Datenbank (03 B4.4), aufgerufen über `npm run db:seed` bzw. `npm run db:reset` (nach `build`):
 *
 *   node dist/database/db-cli.js seed  [--fixture <name>] [--force-delete-collected-data]
 *   node dist/database/db-cli.js reset [--fixture <name>] [--force-delete-collected-data]
 *
 * Konfiguration aus `api/.env` und der Umgebung (Teilschema `SeedEnvSchema`: `NODE_ENV`, `DB_PATH` Pflicht,
 * `DEV_ADMIN_PASSWORD` optional, **kein** `JWT_SECRET`). Ziel ist `DB_PATH`. Mit `DEV_ADMIN_PASSWORD` entsteht
 * dabei der Dev-Admin `admin` (Schritt 10); ohne die Variable kein Admin, nur ein Hinweis. Exit-Code 0 bei Erfolg, 1 bei Abbruch oder
 * Fehler (die DB ist dann unverändert), 2 bei falschem Aufruf.
 */
interface CliArgs {
  command: 'seed' | 'reset';
  fixture: string | null;
  force: boolean;
}

const USAGE = `Aufruf: db-cli <seed|reset> [--fixture <name>] [${FORCE_FLAG}]`;

function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
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

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const label = args.fixture ? `Fixture "${args.fixture}"` : 'Dev-Seed';
  try {
    const config = await loadEnv(SeedEnvSchema);
    const dbPath = resolveDbPath(config.DB_PATH);
    const env = { NODE_ENV: config.NODE_ENV, DEV_ADMIN_PASSWORD: config.DEV_ADMIN_PASSWORD };
    if (args.command === 'seed') {
      const seed = await runSeed({ dbPath, fixture: args.fixture, force: args.force, env });
      console.log(`db:seed: ${label} in ${dbPath}: ${seed.observations} Stunden, ${seed.imports} Import(e), ` +
        `${seed.forecastDays} Vorhersagetag(e); Tage ${seed.days[0] ?? '-'} bis ${seed.days[seed.days.length - 1] ?? '-'}`);
      console.log(`db:seed: ${describeDevAdmin(seed.devAdmin)}`);
    } else {
      const result = await runReset({ dbPath, fixture: args.fixture, force: args.force, env });
      console.log(`db:reset: Sicherung ${result.backupPath ?? '(keine, Datei gab es nicht)'}`);
      console.log(`db:reset: ${dbPath} neu angelegt, Migrationen ausgeführt, ${label}: ${result.seed.observations} Stunden, ` +
        `Tage ${result.seed.days[0] ?? '-'} bis ${result.seed.days[result.seed.days.length - 1] ?? '-'}`);
      console.log(`db:reset: ${describeDevAdmin(result.seed.devAdmin)}`);
    }
    return 0;
  } catch (error) {
    const prefix = error instanceof CollectedDataError || error instanceof EnvConfigError ? 'Abbruch' : 'Fehler';
    console.error(`${prefix}: ${(error as Error).message}`);
    return 1;
  }
}

void main().then(code => {
  process.exitCode = code;
});
