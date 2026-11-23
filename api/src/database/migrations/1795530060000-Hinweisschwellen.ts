import type { MigrationInterface, QueryRunner } from 'typeorm';
import { R30_THRESHOLDS } from '../../notices/notice';

/**
 * Daten-Migration (03 B4.4, R30; Schritt 12c): die drei Hinweisschwellen sind Stammdaten wie der Standort und
 * die Rolle `admin` und müssen auch in Produktion da sein. Idempotent (`ON CONFLICT DO NOTHING` an
 * `UNIQUE(type)`); eine schon vorhandene Zeile bleibt unverändert. Frost `min_temp < 0 °C`, Hitze
 * `max_temp ≥ 30 °C`, Starkregen `precipitation_sum ≥ 20 mm`.
 */
export class Hinweisschwellen1795530060000 implements MigrationInterface {
  name = 'Hinweisschwellen1795530060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of R30_THRESHOLDS) {
      await queryRunner.query(
        `INSERT INTO "notice_threshold" ("type", "field", "comparator", "value", "unit") VALUES (?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [t.type, t.field, t.comparator, t.value, t.unit],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notice_threshold" WHERE "type" IN (${R30_THRESHOLDS.map(() => '?').join(', ')})`,
      R30_THRESHOLDS.map(t => t.type),
    );
  }
}
