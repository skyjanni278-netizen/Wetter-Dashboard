import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { DataSource } from 'typeorm';
import { insertImport, openTestDatabase } from '../../test/support/database';
import {
  BackupError,
  backupFileName,
  backupFilePattern,
  backupStamp,
  defaultBackupDir,
  runBackup,
  runRestore,
} from './db-backup';

const NOW = new Date('2026-11-23T10:15:30.456Z');
const HOURS = ['2026-11-10T10:00:00Z', '2026-11-10T11:00:00Z', '2026-11-10T12:00:00Z'];

/** Lesender Blick in eine Datei, unabhängig von TypeORM. */
function read<T>(file: string, sql: string, ...params: unknown[]): T {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).get(...params) as T;
  } finally {
    db.close();
  }
}

function countObservations(file: string): number {
  return read<{ n: number }>(file, `SELECT COUNT(*) AS "n" FROM "observation"`).n;
}

function temperatureAt(file: string, timeUtc: string): number | undefined {
  return read<{ temperature: number } | undefined>(file, `SELECT "temperature" FROM "observation" WHERE "time_utc" = ?`, timeUtc)
    ?.temperature;
}

/** Migrierte Datei-DB mit einem Import `legacy` und drei Stunden (7,5 / 8,5 / 9,5 °C); bleibt offen wie bei Nest. */
async function createCollectedDb(dbPath: string): Promise<DataSource> {
  const ds = await openTestDatabase(dbPath);
  const importId = await insertImport(ds, { kind: 'legacy' });
  for (const [i, time] of HOURS.entries()) {
    await ds.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature", "source", "import_id", "fetched_at", "updated_at")
       VALUES (1, ?, '2026-11-10', ?, 60, ?, 'archive', ?, '2026-11-10T13:00:00Z', '2026-11-10T13:00:00Z')`,
      [time, 11 + i, 7.5 + i, importId],
    );
  }
  return ds;
}

/** Eine Stunde ändern, eine löschen, eine neue einfügen (Stand „nach der Sicherung“). */
async function changeData(ds: DataSource): Promise<void> {
  await ds.query(`UPDATE "observation" SET "temperature" = 21.0, "version" = "version" + 1 WHERE "time_utc" = ?`, [HOURS[0]]);
  await ds.query(`DELETE FROM "observation" WHERE "time_utc" = ?`, [HOURS[2]]);
  await ds.query(
    `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature", "source", "import_id", "fetched_at", "updated_at")
     VALUES (1, '2026-11-11T10:00:00Z', '2026-11-11', 11, 60, 3.0, 'archive', 1, '2026-11-11T13:00:00Z', '2026-11-11T13:00:00Z'),
            (1, '2026-11-11T11:00:00Z', '2026-11-11', 12, 60, 4.0, 'archive', 1, '2026-11-11T13:00:00Z', '2026-11-11T13:00:00Z')`,
  );
}

/** Eigene Sicherungen (nur Dateien mit dem Muster). */
async function ownBackups(dir: string, dbPath: string): Promise<string[]> {
  return (await readdir(dir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && backupFilePattern(dbPath).test(entry.name))
    .map(entry => entry.name)
    .sort();
}

describe('db:backup und db:restore (Schritt 14c, 03 C4/C5)', () => {
  let dir: string;
  let dbPath: string;
  let backupDir: string;
  const openSources: DataSource[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wetter-db-backup-'));
    dbPath = path.join(dir, 'weather.db');
    backupDir = defaultBackupDir(dbPath);
  });

  afterEach(async () => {
    for (const ds of openSources.splice(0)) if (ds.isInitialized) await ds.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  async function collected(): Promise<DataSource> {
    const ds = await createCollectedDb(dbPath);
    openSources.push(ds);
    return ds;
  }

  describe('Namen', () => {
    it('weather-YYYY-MM-DDTHH-MM-SSZ.db (UTC, ohne Millisekunden), Standardordner backups neben der DB', () => {
      expect(backupStamp(NOW)).toBe('2026-11-23T10-15-30Z');
      expect(backupFileName(dbPath, NOW)).toBe('weather-2026-11-23T10-15-30Z.db');
      expect(backupFileName(path.join(dir, 'weather.dev.db'), NOW)).toBe('weather.dev-2026-11-23T10-15-30Z.db');
      expect(backupDir).toBe(path.join(dir, 'backups'));
    });

    it('Muster nur für die eigene DB: weder Dev-DB noch Sicherung vor der Wiederherstellung noch ähnliche Namen', () => {
      const pattern = backupFilePattern(dbPath);
      expect(pattern.test('weather-2026-11-23T10-15-30Z.db')).toBe(true);
      for (const name of [
        'weather.dev-2026-11-23T10-15-30Z.db',
        'weather-before-restore-2026-11-23T10-15-30Z.db',
        'weather-2026-11-23.db',
        'weather-2026-11-23T10-15-30Z.db.partial',
        'weather-2026-11-23T10-15-30Z.db-wal',
        'xweather-2026-11-23T10-15-30Z.db',
      ]) {
        expect(pattern.test(name)).toBe(false);
      }
    });
  });

  describe('db:backup', () => {
    it('sichert während eine zweite Verbindung (Nest) offen ist und gerade geschrieben hat: integrity_check ok, COUNT(*) gleich', async () => {
      const nest = await collected();
      await nest.query(`UPDATE "observation" SET "temperature" = 12.5 WHERE "time_utc" = ?`, [HOURS[1]]); // nur im WAL
      expect(existsSync(`${dbPath}-wal`)).toBe(true);

      const result = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });

      expect(result.file).toBe(path.join(backupDir, 'weather-2026-11-23T10-15-30Z.db'));
      expect(result).toMatchObject({ integrity: 'ok', observations: 3, sourceObservations: 3, deleted: [], kept: 1 });
      expect(countObservations(result.file)).toBe(3);
      expect(temperatureAt(result.file, HOURS[1])).toBe(12.5);
      expect(read<{ integrity_check: string }>(result.file, 'PRAGMA integrity_check').integrity_check).toBe('ok');
      expect(existsSync(`${result.file}.partial`)).toBe(false);
    });

    it('ohne Datei DB_PATH → Abbruch, kein Ordner und keine Datei angelegt', async () => {
      await expect(runBackup({ dbPath, backupDir, keep: 14, now: NOW })).rejects.toThrow(BackupError);
      await expect(runBackup({ dbPath, backupDir, keep: 14, now: NOW })).rejects.toThrow(/gibt es nicht/);
      expect(existsSync(backupDir)).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    });

    it('zweimal in derselben Sekunde → Abbruch, die erste Sicherung bleibt', async () => {
      await collected();
      const first = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await expect(runBackup({ dbPath, backupDir, keep: 14, now: NOW })).rejects.toThrow(/gibt es schon/);
      expect(countObservations(first.file)).toBe(3);
      expect(await readdir(backupDir)).toEqual(['weather-2026-11-23T10-15-30Z.db']);
    });

    it('Aufbewahrung: nach N+2 Läufen genau N eigene Dateien (die neuesten); fremde Dateien bleiben liegen', async () => {
      await collected();
      await mkdir(backupDir, { recursive: true });
      const foreign = [
        'notizen.txt',
        'weather-2020-01-01.db',
        'weather.dev-2020-01-01T00-00-00Z.db',
        'weather-before-restore-2020-01-01T00-00-00Z.db',
        'weather-2020-01-01T00-00-00Z.db-wal',
      ];
      for (const name of foreign) await writeFile(path.join(backupDir, name), 'fremd');
      await mkdir(path.join(backupDir, 'weather-2019-01-01T00-00-00Z.db')); // Ordner mit passendem Namen

      const keep = 3;
      const results = [];
      for (let i = 0; i < keep + 2; i++) {
        results.push(await runBackup({ dbPath, backupDir, keep, now: new Date(NOW.getTime() + i * 3_600_000) }));
      }

      expect(await ownBackups(backupDir, dbPath)).toEqual([
        'weather-2026-11-23T12-15-30Z.db',
        'weather-2026-11-23T13-15-30Z.db',
        'weather-2026-11-23T14-15-30Z.db',
      ]);
      expect(results[3].deleted).toEqual(['weather-2026-11-23T10-15-30Z.db']);
      expect(results[4]).toMatchObject({ deleted: ['weather-2026-11-23T11-15-30Z.db'], kept: keep });
      const all = await readdir(backupDir);
      for (const name of [...foreign, 'weather-2019-01-01T00-00-00Z.db']) expect(all).toContain(name);
      expect(all).toHaveLength(keep + foreign.length + 1);
    });
  });

  describe('db:restore', () => {
    it('Wiederherstellungstest: Daten, db:backup, Daten ändern, db:restore → COUNT(*) und geänderte Stunde wie vor der Änderung', async () => {
      const nest = await collected();
      const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await changeData(nest);
      expect(countObservations(dbPath)).toBe(4);
      expect(temperatureAt(dbPath, HOURS[0])).toBe(21);
      await nest.destroy(); // Nest gestoppt

      const later = new Date(NOW.getTime() + 60_000);
      const result = await runRestore({ dbPath, from: backup.file, backupDir, yes: true, env: { NODE_ENV: 'development' }, now: later });

      expect(countObservations(dbPath)).toBe(3);
      expect(temperatureAt(dbPath, HOURS[0])).toBe(7.5);
      expect(temperatureAt(dbPath, HOURS[2])).toBe(9.5);
      expect(temperatureAt(dbPath, '2026-11-11T10:00:00Z')).toBeUndefined();
      expect(result.restored).toMatchObject({ integrity: 'ok', observations: 3 });
      expect(result.source).toMatchObject({ integrity: 'ok', observations: 3 });
      expect(result.pendingMigrations).toEqual([]);
      expect(read<{ journal_mode: string }>(dbPath, 'PRAGMA journal_mode').journal_mode).toBe('wal');

      // Vorher gesichert: der geänderte Stand, unter eigenem Namen (fällt nicht unter die Aufbewahrung).
      expect(result.preRestoreBackup).toBe(path.join(backupDir, 'weather-before-restore-2026-11-23T10-16-30Z.db'));
      expect(countObservations(result.preRestoreBackup!)).toBe(4);
      expect(temperatureAt(result.preRestoreBackup!, HOURS[0])).toBe(21);
      expect(await ownBackups(backupDir, dbPath)).toEqual([path.basename(backup.file)]);
      expect((await readdir(dir)).filter(name => name.includes('.restore-'))).toEqual([]); // keine Zwischendatei

      // Die App kann die Datei wieder öffnen und schreiben.
      const reopened = await openTestDatabase(dbPath);
      openSources.push(reopened);
      await reopened.query(`UPDATE "observation" SET "temperature" = 1 WHERE "time_utc" = ?`, [HOURS[1]]);
    });

    it('ohne --yes (auch in Produktion): Warnung, nichts geändert, keine Sicherung', async () => {
      const nest = await collected();
      const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await changeData(nest);
      await nest.destroy();

      for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'production' }]) {
        await expect(runRestore({ dbPath, from: backup.file, backupDir, yes: false, env, now: NOW })).rejects.toThrow(/--yes/);
      }
      await expect(
        runRestore({ dbPath, from: backup.file, backupDir, yes: false, env: { NODE_ENV: 'production' }, now: NOW }),
      ).rejects.toThrow(/NODE_ENV=production/);
      expect(countObservations(dbPath)).toBe(4);
      expect(await readdir(backupDir)).toEqual([path.basename(backup.file)]);
    });

    it('Nest hat die DB offen → Abbruch auch mit --yes, nichts geändert', async () => {
      const nest = await collected();
      const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await changeData(nest);

      await expect(
        runRestore({ dbPath, from: backup.file, backupDir, yes: true, env: { NODE_ENV: 'development' }, now: NOW }),
      ).rejects.toThrow(/von einem anderen Prozess geöffnet/);
      const [row]: { n: number }[] = await nest.query(`SELECT COUNT(*) AS "n" FROM "observation"`);
      expect(row.n).toBe(4);
      expect(await readdir(backupDir)).toEqual([path.basename(backup.file)]);
    });

    describe('Abbruch bei fehlender oder kaputter Quelle, DB_PATH unverändert', () => {
      let from: string;

      beforeEach(async () => {
        const nest = await collected();
        const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
        from = backup.file;
        await changeData(nest);
        await nest.destroy();
      });

      async function expectUnchanged(): Promise<void> {
        expect(countObservations(dbPath)).toBe(4);
        expect(temperatureAt(dbPath, HOURS[0])).toBe(21);
        expect((await readdir(backupDir)).filter(name => name.includes('before-restore'))).toEqual([]);
      }

      it('Quelle gibt es nicht', async () => {
        await expect(
          runRestore({ dbPath, from: path.join(dir, 'gibt-es-nicht.db'), backupDir, yes: true, env: {}, now: NOW }),
        ).rejects.toThrow(/gibt es nicht/);
        expect(existsSync(path.join(dir, 'gibt-es-nicht.db'))).toBe(false);
        await expectUnchanged();
      });

      it('Quelle ist keine SQLite-Datei', async () => {
        const text = path.join(dir, 'kaputt.db');
        await writeFile(text, 'das ist keine Datenbank, sondern Text'.repeat(200));
        await expect(runRestore({ dbPath, from: text, backupDir, yes: true, env: {}, now: NOW })).rejects.toThrow(
          /beschädigt oder keine SQLite-Datenbank/,
        );
        await expectUnchanged();
      });

      it('Quelle beschädigt (Seiten überschrieben) → integrity_check nicht ok', async () => {
        const handle = await open(from, 'r+');
        try {
          await handle.write(Buffer.alloc(4096, 0xab), 0, 4096, 4096 * 2); // dritte Seite
        } finally {
          await handle.close();
        }
        await expect(runRestore({ dbPath, from, backupDir, yes: true, env: {}, now: NOW })).rejects.toThrow(BackupError);
        await expect(runRestore({ dbPath, from, backupDir, yes: true, env: {}, now: NOW })).rejects.toThrow(
          /integrity_check meldet Fehler|beschädigt/,
        );
        await expectUnchanged();
      });

      it('SQLite-Datei ohne Tabelle migrations (keine DB dieser App)', async () => {
        const other = path.join(dir, 'fremd.db');
        const db = new Database(other);
        db.exec('CREATE TABLE "observation" ("x"); INSERT INTO "observation" VALUES (1)');
        db.close();
        await expect(runRestore({ dbPath, from: other, backupDir, yes: true, env: {}, now: NOW })).rejects.toThrow(
          /keine Tabelle "migrations"/,
        );
        await expectUnchanged();
      });

      it('--from ist DB_PATH selbst', async () => {
        await expect(runRestore({ dbPath, from: dbPath, backupDir, yes: true, env: {}, now: NOW })).rejects.toThrow(/DB_PATH selbst/);
        await expectUnchanged();
      });
    });

    it('ohne vorhandene DB_PATH: Datei entsteht, keine Sicherung vorher', async () => {
      const nest = await collected();
      const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await nest.destroy();
      const target = path.join(dir, 'neu', 'weather.db');

      const result = await runRestore({ dbPath: target, from: backup.file, backupDir, yes: true, env: {}, now: NOW });

      expect(result.preRestoreBackup).toBeNull();
      expect(countObservations(target)).toBe(3);
    });

    it('ältere Sicherung (Migration fehlt) → wiederhergestellt mit Hinweis auf migration:run', async () => {
      const nest = await collected();
      await nest.query(`DELETE FROM "migrations" WHERE "name" = 'Hinweisschwellen1795530060000'`);
      const backup = await runBackup({ dbPath, backupDir, keep: 14, now: NOW });
      await nest.destroy();

      const result = await runRestore({ dbPath, from: backup.file, backupDir, yes: true, env: {}, now: new Date(NOW.getTime() + 1000) });

      expect(result.pendingMigrations).toEqual(['Hinweisschwellen1795530060000']);
    });
  });
});
