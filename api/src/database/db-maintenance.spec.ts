import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { insertImport, openTestDatabase } from '../../test/support/database';
import { CollectedDataError } from './collected-data';
import { backupPathOf, runReset, runSeed } from './db-maintenance';
import { DEV_SEED, DEV_SEED_DST_DAY, DEV_SEED_FROM, DEV_SEED_TO } from './seeds/dev.seed';

const NOW = new Date('2026-11-21T10:00:00Z');

async function count(dbPath: string, table: string, where = '1 = 1'): Promise<number> {
  const ds = await openTestDatabase(dbPath);
  try {
    const [row]: { n: number }[] = await ds.query(`SELECT COUNT(*) AS "n" FROM "${table}" WHERE ${where}`);
    return row.n;
  } finally {
    await ds.destroy();
  }
}

/** Datei-DB mit Schema, einem Import der gegebenen Art und einer Stunde (wie gesammelte Daten). */
async function createDb(dbPath: string, kind: 'legacy' | 'scheduled' | 'range'): Promise<void> {
  const ds = await openTestDatabase(dbPath);
  try {
    const importId = await insertImport(ds, { kind });
    await ds.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature", "source", "import_id", "fetched_at", "updated_at")
       VALUES (1, '2026-11-10T11:00:00Z', '2026-11-10', 12, 60, 7.5, 'archive', ?, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z')`,
      [importId],
    );
  } finally {
    await ds.destroy();
  }
}

describe('db:seed und db:reset (03 B4.4, Schutz der gesammelten Daten)', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wetter-db-reset-'));
    dbPath = path.join(dir, 'weather.test.db');
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it.each(['legacy', 'scheduled'] as const)(
    'db:reset bei Import kind = %s → Abbruch mit Hinweis, COUNT(*) unverändert, keine Sicherung',
    async kind => {
      await createDb(dbPath, kind);
      await expect(runReset({ dbPath, force: false, env: {}, now: NOW })).rejects.toThrow(CollectedDataError);
      await expect(runReset({ dbPath, force: false, env: {}, now: NOW })).rejects.toThrow(/gesammelte Daten.*--force-delete-collected-data/);
      expect(await count(dbPath, 'observation')).toBe(1);
      expect(existsSync(backupPathOf(dbPath))).toBe(false);
    },
  );

  it('db:seed bei gesammelten Daten → Abbruch, Daten unverändert', async () => {
    await createDb(dbPath, 'legacy');
    await expect(runSeed({ dbPath, force: false, env: {}, now: NOW })).rejects.toThrow(CollectedDataError);
    expect(await count(dbPath, 'observation')).toBe(1);
  });

  it('NODE_ENV=production → Abbruch, auch mit --force-delete-collected-data', async () => {
    await createDb(dbPath, 'range');
    const env = { NODE_ENV: 'production' };
    await expect(runReset({ dbPath, force: true, env, now: NOW })).rejects.toThrow(/NODE_ENV=production/);
    await expect(runSeed({ dbPath, force: true, env, now: NOW })).rejects.toThrow(/NODE_ENV=production/);
    expect(await count(dbPath, 'observation')).toBe(1);
  });

  it('mit --force-delete-collected-data: Sicherung per VACUUM INTO, neue DB mit Migrationen und Dev-Seed', async () => {
    await createDb(dbPath, 'legacy');
    const result = await runReset({ dbPath, force: true, env: {}, now: NOW });

    expect(result.backupPath).toBe(`${dbPath}-before-reset.db`);
    expect(await count(result.backupPath!, 'observation')).toBe(1); // Sicherung enthält die alten Daten
    expect(await count(result.backupPath!, 'import', `"kind" = 'legacy'`)).toBe(1);
    expect(await count(dbPath, 'observation')).toBe(DEV_SEED.observations.length);
    expect(await count(dbPath, 'import', `"kind" IN ('legacy','scheduled')`)).toBe(0);
    expect(result.seed.days).toEqual([DEV_SEED_FROM, DEV_SEED_DST_DAY, DEV_SEED_TO]);
  });

  it('ohne gesammelte Daten läuft db:reset ohne Schalter; eine ältere Sicherung wird nicht überschrieben', async () => {
    await createDb(dbPath, 'range');
    await runReset({ dbPath, force: false, env: {}, now: NOW });
    await runReset({ dbPath, force: false, env: {}, now: new Date('2026-11-21T11:00:00Z'), fixture: 'us16-ok' });

    const files = (await readdir(dir)).filter(name => name.includes('before-reset')).sort();
    expect(files).toEqual(['weather.test.db-before-reset.20261121T110000.db', 'weather.test.db-before-reset.db'].sort());
    expect(await count(dbPath, 'observation')).toBe(240);
  });

  it('db:reset ohne vorhandene Datei: keine Sicherung, Schema und Seed entstehen', async () => {
    const result = await runReset({ dbPath, force: false, env: {}, now: NOW });
    expect(result.backupPath).toBeNull();
    expect(await count(dbPath, 'location')).toBe(1);
  });

  it('db:seed --fixture us16-ok: ersetzt alle Daten; Import scheduled wird als range angelegt (sonst sperrte er den nächsten Seed)', async () => {
    await runReset({ dbPath, force: false, env: {}, now: NOW });
    const summary = await runSeed({ dbPath, fixture: 'us16-ok', force: false, env: {}, now: NOW });
    expect(summary).toMatchObject({ name: 'us16-ok', observations: 240, imports: 1, forecastDays: 7 });
    expect(await count(dbPath, 'observation')).toBe(240);
    expect(await count(dbPath, 'import', `"kind" = 'range' AND "finished_at" = '2026-11-19T13:05:12Z'`)).toBe(1);
    expect(await count(dbPath, 'observation', `"source" = 'prediction'`)).toBe(9);
    // Ein zweiter Seed ist erlaubt (keine gesammelten Daten) und ersetzt den ersten.
    await runSeed({ dbPath, fixture: 'us16-delayed', force: false, env: {}, now: NOW });
    expect(await count(dbPath, 'observation', `"source" = 'prediction'`)).toBe(12);
  });

  it('db:seed ohne Datei oder mit unbekannter Fixture → Fehler, nichts angelegt', async () => {
    await expect(runSeed({ dbPath, force: false, env: {}, now: NOW })).rejects.toThrow(/migration:run/);
    expect(existsSync(dbPath)).toBe(false);
    await expect(runSeed({ dbPath, fixture: 'gibtsnicht', force: false, env: {}, now: NOW })).rejects.toThrow(/nicht gefunden/);
  });
});
