import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { loadFixture } from '../fixtures/fixture';
import type { Fixture } from '../fixtures/fixture';
import { assertMayDeleteData, assertNotProduction } from './collected-data';
import { dataSourceOptions } from './database-options';
import { isMemoryDatabase } from './db-path';
import { applySeed } from './seeds/apply-seed';
import type { SeedSummary } from './seeds/apply-seed';
import { devAdminPasswordFromEnv, seedDevAdmin } from './seeds/dev-admin';
import type { DevAdminResult } from './seeds/dev-admin';
import { DEV_SEED } from './seeds/dev.seed';

export interface MaintenanceOptions {
  dbPath: string;
  /** Name einer Fixture aus `api/test/fixtures/` (`--fixture`), sonst der Dev-Seed. */
  fixture?: string | null;
  /** `--force-delete-collected-data` */
  force: boolean;
  env: NodeJS.ProcessEnv;
  now?: Date;
}

/** Ergebnis eines Seeds: Daten plus Dev-Admin (Schritt 10, `DEV_ADMIN_PASSWORD`). */
export interface SeedResult extends SeedSummary {
  devAdmin: DevAdminResult;
}

export interface ResetResult {
  backupPath: string | null;
  seed: SeedResult;
}

/** Sicherung vor dem Löschen (03 B4.4): `VACUUM INTO '<DB_PATH>-before-reset.db'`. */
export function backupPathOf(dbPath: string): string {
  return `${dbPath}-before-reset.db`;
}

function seedOf(fixture: string | null | undefined): Fixture {
  return fixture ? loadFixture(fixture) : DEV_SEED;
}

async function open(dbPath: string): Promise<DataSource> {
  const dataSource = new DataSource({ ...dataSourceOptions(dbPath), migrationsRun: false });
  await dataSource.initialize();
  return dataSource;
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Zeitstempel (UTC) des Resets, der eine ältere Sicherung ablöst; sie bleibt unter diesem Namen (`20261121T120501`). */
function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
}

/**
 * `npm run db:seed [-- --fixture <name>]` (03 B4.4): verweigert in Produktion und bei gesammelten Daten
 * (außer mit `--force-delete-collected-data`), verlangt ein aktuelles Schema (`migration:run`) und ersetzt dann
 * alle Daten durch den Seed. Bei Abbruch bleibt die Datenbank unverändert. Mit `DEV_ADMIN_PASSWORD` legt er
 * danach den Dev-Admin `admin` an bzw. setzt dessen Passwort (Schritt 10); ohne die Variable kein Admin.
 */
export async function runSeed(options: MaintenanceOptions): Promise<SeedResult> {
  assertNotProduction(options.env, 'db:seed');
  const seed = seedOf(options.fixture);
  const adminPassword = devAdminPasswordFromEnv(options.env);
  const now = options.now ?? new Date();
  if (!isMemoryDatabase(options.dbPath) && !existsSync(options.dbPath)) {
    throw new Error(`${options.dbPath} gibt es nicht. Zuerst npm run migration:run (oder npm run db:reset).`);
  }
  const dataSource = await open(options.dbPath);
  try {
    if (await dataSource.showMigrations()) {
      throw new Error('Es gibt offene Migrationen. Zuerst npm run migration:run.');
    }
    await assertMayDeleteData(dataSource, { ...options, action: 'db:seed' });
    const summary = await applySeed(dataSource, seed, now);
    return { ...summary, devAdmin: await seedDevAdmin(dataSource, adminPassword, now) };
  } finally {
    await dataSource.destroy();
  }
}

/**
 * `npm run db:reset [-- --fixture <name>]` (03 B4.4), **ein** Befehl: verweigert in Produktion und bei
 * gesammelten Daten (außer mit `--force-delete-collected-data`), sichert per `VACUUM INTO`, löscht `DB_PATH`
 * sowie `-wal` und `-shm`, führt die Migrationen aus und spielt den Seed ein. Bei Abbruch bleibt die Datenbank
 * unverändert. Eine ältere Sicherung wird mit Zeitstempel umbenannt statt überschrieben. Dev-Admin wie `runSeed`.
 */
export async function runReset(options: MaintenanceOptions): Promise<ResetResult> {
  assertNotProduction(options.env, 'db:reset');
  if (isMemoryDatabase(options.dbPath)) throw new Error('db:reset braucht eine Datei als DB_PATH.');
  const seed = seedOf(options.fixture);
  const adminPassword = devAdminPasswordFromEnv(options.env);
  const now = options.now ?? new Date();

  let backupPath: string | null = null;
  if (existsSync(options.dbPath)) {
    const current = await open(options.dbPath);
    try {
      await assertMayDeleteData(current, { ...options, action: 'db:reset' });
      backupPath = backupPathOf(options.dbPath);
      if (existsSync(backupPath)) await rename(backupPath, `${options.dbPath}-before-reset.${stamp(now)}.db`);
      await current.query(`VACUUM INTO ${sqlText(backupPath)}`);
    } finally {
      await current.destroy();
    }
    for (const file of [options.dbPath, `${options.dbPath}-wal`, `${options.dbPath}-shm`]) {
      await rm(file, { force: true });
    }
  }

  const fresh = await open(options.dbPath);
  try {
    await fresh.runMigrations({ transaction: 'each' });
    const summary = await applySeed(fresh, seed, now);
    return { backupPath, seed: { ...summary, devAdmin: await seedDevAdmin(fresh, adminPassword, now) } };
  } finally {
    await fresh.destroy();
  }
}
