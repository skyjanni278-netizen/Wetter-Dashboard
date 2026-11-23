import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schritt 12c (03 B2.3, B2.6, R30): Stammdatentabelle `notice_threshold` für die Hinweise aus der Vorhersage
 * (N07) mit `UNIQUE(type)` und je einem `CHECK` für Typ, Feld und Vergleichsoperator. Von Hand geschrieben mit
 * denselben Constraint-Namen wie die Entity `NoticeThreshold`; die Tabelle steht in **einer** SQL-Zeile (wie
 * `InitialSchema`), damit `migration:generate` danach keinen Unterschied findet. Die Zeilen kommen mit der
 * Daten-Migration `Hinweisschwellen`.
 */
function createTable(name: string, parts: readonly string[]): string {
  return `CREATE TABLE "${name}" (${parts.join(', ')})`;
}

export class NoticeThreshold1795530000000 implements MigrationInterface {
  name = 'NoticeThreshold1795530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      createTable('notice_threshold', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"type" text NOT NULL',
        '"field" text NOT NULL',
        '"comparator" text NOT NULL',
        '"value" real NOT NULL',
        '"unit" text NOT NULL',
        'CONSTRAINT "UQ_notice_threshold_type" UNIQUE ("type")',
        `CONSTRAINT "CHK_notice_threshold_comparator" CHECK ("comparator" IN ('lt','gte'))`,
        `CONSTRAINT "CHK_notice_threshold_field" CHECK ("field" IN ('min_temp','max_temp','precipitation_sum'))`,
        `CONSTRAINT "CHK_notice_threshold_type" CHECK ("type" IN ('frost','heat','heavy_rain'))`,
      ]),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notice_threshold"`);
  }
}
