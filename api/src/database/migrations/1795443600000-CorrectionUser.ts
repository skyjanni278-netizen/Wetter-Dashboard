import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schritt 12a (03 B2.3, B2.6; offen aus Schritt 10): Fremdschlüssel `correction.corrected_by → user(id)`
 * (`ON DELETE RESTRICT`, die Historie bleibt). `INDEX(corrected_at)`, `reverts_correction_id` mit FK und
 * `UNIQUE` gibt es schon seit `InitialSchema`.
 *
 * SQLite kann einen Fremdschlüssel nicht nachträglich anlegen; die Tabelle wird deshalb neu aufgebaut (alte
 * umbenennen, neue anlegen, Daten in ID-Reihenfolge kopieren, alte löschen, Index neu). Bis Schritt 11 ist
 * `correction` leer, die Kopie funktioniert aber auch mit Daten (geprüft in `correction-user.migration.spec.ts`).
 *
 * `PRAGMA foreign_keys`: `migration:run` schaltet die Prüfung vorher aus (TypeORM `beforeMigration`),
 * `migration:revert` nicht (dort steht `PRAGMA foreign_keys = OFF` schon in der Transaktion und ist
 * wirkungslos). Der Aufbau funktioniert deshalb in beiden Fällen: `defer_foreign_keys` verschiebt die Prüfung
 * ans Ende der Transaktion, und die Reihenfolge lässt keinen Verweis auf die gelöschte Tabelle übrig. Zum Schluss
 * prüft `foreign_key_check` die neue Tabelle ausdrücklich, weil beim Wiedereinschalten nichts nachgeprüft wird:
 * Ein Eintrag mit unbekanntem Konto bricht die Migration ab, die Transaktion rollt zurück.
 */
function createTable(name: string, parts: readonly string[]): string {
  return `CREATE TABLE "${name}" (${parts.join(', ')})`;
}

const COLUMNS = [
  '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
  '"observation_id" integer NOT NULL',
  '"field" text NOT NULL',
  '"old_value" real',
  '"new_value" real',
  '"reason" text NOT NULL',
  '"corrected_by" integer NOT NULL',
  '"corrected_at" text NOT NULL',
  '"reverts_correction_id" integer',
  'CONSTRAINT "UQ_correction_reverts" UNIQUE ("reverts_correction_id")',
  'CONSTRAINT "CHK_correction_reason" CHECK (length("reason") BETWEEN 3 AND 500)',
  `CONSTRAINT "CHK_correction_field" CHECK ("field" IN ('temperature','apparent_temperature','precipitation','weather_code','wind_speed','wind_direction'))`,
  'CONSTRAINT "FK_correction_observation" FOREIGN KEY ("observation_id") REFERENCES "observation" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
  'CONSTRAINT "FK_correction_reverts" FOREIGN KEY ("reverts_correction_id") REFERENCES "correction" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
] as const;

const FK_USER =
  'CONSTRAINT "FK_correction_user" FOREIGN KEY ("corrected_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION';

const COLUMN_NAMES =
  '"id", "observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at", "reverts_correction_id"';

/**
 * Baut `correction` mit den angegebenen Teilen neu auf; Daten und IDs bleiben. Erst umbenennen, dann neu
 * anlegen: SQLite schreibt beim Umbenennen auch den Selbstverweis (`reverts_correction_id`) auf den neuen
 * Namen um. So zeigt beim Löschen der alten Tabelle kein Eintrag der neuen auf sie, auch wenn die Prüfung an ist
 * (`migration:revert` läuft bei TypeORM mit `foreign_keys = ON`).
 */
async function rebuild(queryRunner: QueryRunner, parts: readonly string[]): Promise<void> {
  await queryRunner.query('PRAGMA defer_foreign_keys = ON');
  await queryRunner.query(`ALTER TABLE "correction" RENAME TO "temporary_correction"`);
  await queryRunner.query(`DROP INDEX "IDX_correction_corrected_at"`);
  await queryRunner.query(createTable('correction', parts));
  await queryRunner.query(
    `INSERT INTO "correction" (${COLUMN_NAMES}) SELECT ${COLUMN_NAMES} FROM "temporary_correction" ORDER BY "id"`,
  );
  await queryRunner.query(`DROP TABLE "temporary_correction"`);
  await queryRunner.query(`CREATE INDEX "IDX_correction_corrected_at" ON "correction" ("corrected_at") `);
  const violations: unknown[] = await queryRunner.query(`PRAGMA foreign_key_check("correction")`);
  if (violations.length > 0) {
    throw new Error(`correction: ${violations.length} Einträge verletzen einen Fremdschlüssel (z. B. unbekanntes Konto in corrected_by).`);
  }
}

export class CorrectionUser1795443600000 implements MigrationInterface {
  name = 'CorrectionUser1795443600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await rebuild(queryRunner, [...COLUMNS, FK_USER]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await rebuild(queryRunner, COLUMNS);
  }
}
