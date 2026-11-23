import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../database-options';
import { MIGRATIONS } from './index';

/**
 * Migration `CorrectionUser` (Schritt 12a) auf einer Datei im Stand von Schritt 11 **mit Daten**: Die Tabelle
 * `correction` wird neu aufgebaut, alle Daten bleiben, danach gilt der Fremdschlüssel `corrected_by → user`.
 */
/** Migrationen bis einschließlich `CorrectionUser` (Stand 12a); spätere Migrationen prüfen eigene Specs. */
const STEP_12A = MIGRATIONS.slice(0, 5);

describe('Migration CorrectionUser1795443600000 (FK correction.corrected_by → user)', () => {
  let dir: string;
  let dbPath: string;

  const open = async (migrations: typeof MIGRATIONS) => {
    const dataSource = new DataSource({ ...dataSourceOptions(dbPath), migrations, migrationsRun: false });
    await dataSource.initialize();
    return dataSource;
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wetter-migration-'));
    dbPath = path.join(dir, 'stand-11.db');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('läuft auf Daten aus Schritt 11: COUNT(*) und Inhalt gleich, foreign_key_check leer, FK wirkt; revert stellt Stand 11 her', async () => {
    const step11 = await open(MIGRATIONS.slice(0, 4));
    await step11.runMigrations({ transaction: 'each' });
    await step11.query(`INSERT INTO "user" ("id", "username", "password_hash", "created_at") VALUES (1, 'admin', 'x', '2026-11-19T09:00:00Z')`);
    await step11.query(
      `INSERT INTO "import" ("location_id", "kind", "status", "from_date", "to_date", "requested_at") VALUES (1, 'legacy', 'succeeded', '2026-11-18', '2026-11-18', '2026-11-19T09:00:00Z')`,
    );
    await step11.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature", "source", "import_id", "fetched_at", "updated_at")
       VALUES (1, '2026-11-18T13:00:00Z', '2026-11-18', 14, 60, 9.6, 'archive', 1, '2026-11-19T09:00:00Z', '2026-11-19T09:00:00Z')`,
    );
    await step11.query(
      `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at")
       VALUES (1, 'temperature', 19.6, 9.6, 'Ausreißer', 1, '2026-11-19T13:20:00Z')`,
    );
    await step11.query(
      `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at", "reverts_correction_id")
       VALUES (1, 'temperature', 9.6, 19.6, 'Rücknahme', 1, '2026-11-19T13:25:00Z', 1)`,
    );
    const before = await step11.query(`SELECT * FROM "correction" ORDER BY "id"`);
    await step11.destroy();

    const current = await open(STEP_12A);
    try {
      expect((await current.runMigrations({ transaction: 'each' })).map(m => m.name)).toEqual(['CorrectionUser1795443600000']);
      expect(await current.query(`SELECT * FROM "correction" ORDER BY "id"`)).toEqual(before);
      expect(await current.query(`SELECT COUNT(*) AS "n" FROM "observation"`)).toEqual([{ n: 1 }]);
      expect(await current.query('PRAGMA foreign_key_check')).toEqual([]);
      expect(await current.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
      const [table]: { sql: string }[] = await current.query(`SELECT "sql" FROM "sqlite_master" WHERE "name" = 'correction'`);
      expect(table.sql).toContain('CONSTRAINT "FK_correction_user" FOREIGN KEY ("corrected_by") REFERENCES "user" ("id") ON DELETE RESTRICT');
      expect(table.sql).toContain('REFERENCES "correction" ("id")');
      expect(await current.query(`SELECT "name" FROM "sqlite_master" WHERE "tbl_name" = 'correction' AND "type" = 'index' AND "sql" IS NOT NULL`)).toEqual([
        { name: 'IDX_correction_corrected_at' },
      ]);
      await expect(
        current.query(
          `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at") VALUES (1, 'temperature', 1, 2, 'Probe', 99, '2026-11-19T13:30:00Z')`,
        ),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
      await expect(current.query(`DELETE FROM "user" WHERE "id" = 1`)).rejects.toThrow(/FOREIGN KEY constraint failed/);

      await current.undoLastMigration({ transaction: 'each' });
      expect(await current.query(`SELECT * FROM "correction" ORDER BY "id"`)).toEqual(before);
      const [reverted]: { sql: string }[] = await current.query(`SELECT "sql" FROM "sqlite_master" WHERE "name" = 'correction'`);
      expect(reverted.sql).not.toContain('FK_correction_user');
    } finally {
      await current.destroy();
    }
  });

  it('bricht ab, wenn ein Eintrag ein unbekanntes Konto nennt (foreign_key_check), und lässt Stand 11 unverändert', async () => {
    const step11 = await open(MIGRATIONS.slice(0, 4));
    await step11.runMigrations({ transaction: 'each' });
    await step11.query(
      `INSERT INTO "import" ("location_id", "kind", "status", "from_date", "to_date", "requested_at") VALUES (1, 'legacy', 'succeeded', '2026-11-18', '2026-11-18', '2026-11-19T09:00:00Z')`,
    );
    await step11.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "source", "import_id", "fetched_at", "updated_at")
       VALUES (1, '2026-11-18T13:00:00Z', '2026-11-18', 14, 60, 'archive', 1, '2026-11-19T09:00:00Z', '2026-11-19T09:00:00Z')`,
    );
    await step11.query(
      `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at") VALUES (1, 'temperature', 1, 2, 'ohne Konto', 7, '2026-11-19T13:20:00Z')`,
    );
    await step11.destroy();

    const current = await open(STEP_12A);
    try {
      await expect(current.runMigrations({ transaction: 'each' })).rejects.toThrow(/unbekanntes Konto/);
      expect(await current.showMigrations()).toBe(true);
      const [table]: { sql: string }[] = await current.query(`SELECT "sql" FROM "sqlite_master" WHERE "name" = 'correction'`);
      expect(table.sql).not.toContain('FK_correction_user');
      expect(await current.query(`SELECT COUNT(*) AS "n" FROM "correction"`)).toEqual([{ n: 1 }]);
    } finally {
      await current.destroy();
    }
  });
});
