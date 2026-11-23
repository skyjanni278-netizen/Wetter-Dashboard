import { DataSource } from 'typeorm';
import { R30_THRESHOLDS } from '../../notices/notice';
import { dataSourceOptions } from '../database-options';
import { MEMORY_DB } from '../db-path';
import { Hinweisschwellen1795530060000 } from './1795530060000-Hinweisschwellen';

/** Migrationen `NoticeThreshold` und `Hinweisschwellen` (Schritt 12c, R30, B2.6) auf `:memory:`. */
describe('Migrationen NoticeThreshold und Hinweisschwellen (R30)', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource(dataSourceOptions(MEMORY_DB));
    await dataSource.initialize();
  });
  afterEach(() => dataSource.destroy());

  const rows = () =>
    dataSource.query(`SELECT "type", "field", "comparator", "value", "unit" FROM "notice_threshold" ORDER BY "id"`);

  it('legt die drei Schwellen aus R30 an: frost < 0 °C, heat ≥ 30 °C, heavy_rain ≥ 20 mm', async () => {
    expect(await rows()).toEqual(R30_THRESHOLDS.map(t => ({ ...t })));
  });

  it('Daten-Migration ist idempotent: ein zweiter Lauf ändert nichts', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await new Hinweisschwellen1795530060000().up(runner);
    } finally {
      await runner.release();
    }
    expect(await rows()).toHaveLength(3);
  });

  it('CHECK lehnt ungültigen Vergleichsoperator, Typ und Feld ab; UNIQUE(type) eine zweite Frost-Zeile', async () => {
    await expect(dataSource.query(`UPDATE "notice_threshold" SET "comparator" = 'xx'`)).rejects.toThrow(
      /CHECK constraint failed: CHK_notice_threshold_comparator/,
    );
    await expect(dataSource.query(`UPDATE "notice_threshold" SET "type" = 'storm' WHERE "type" = 'frost'`)).rejects.toThrow(
      /CHECK constraint failed: CHK_notice_threshold_type/,
    );
    await expect(dataSource.query(`UPDATE "notice_threshold" SET "field" = 'wind_speed'`)).rejects.toThrow(
      /CHECK constraint failed: CHK_notice_threshold_field/,
    );
    await expect(
      dataSource.query(
        `INSERT INTO "notice_threshold" ("type", "field", "comparator", "value", "unit") VALUES ('frost', 'min_temp', 'lt', -5, '°C')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('revert: erst die Zeilen, dann die Tabelle', async () => {
    await dataSource.undoLastMigration({ transaction: 'each' });
    expect(await rows()).toEqual([]);
    await dataSource.undoLastMigration({ transaction: 'each' });
    expect(await dataSource.query(`SELECT "name" FROM "sqlite_master" WHERE "name" = 'notice_threshold'`)).toEqual([]);
  });
});
