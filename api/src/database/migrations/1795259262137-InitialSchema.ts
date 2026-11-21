import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schritt 9 (03 B2.3, B2.6, R15, R16, R19): alle Tabellen mit `CHECK`, Fremdschlüsseln, Unique-Indizes und
 * dem partiellen Unique-Index für laufende Importe. Von Hand geschrieben und geprüft; die Namen der
 * Constraints sind dieselben wie in den Entities, deshalb findet `npm run migration:generate` danach keinen
 * Unterschied. Jede Tabelle entsteht in **einer** SQL-Zeile (so liest TypeORM das Schema später zurück),
 * die Teile stehen hier untereinander.
 */
function createTable(name: string, parts: readonly string[]): string {
  return `CREATE TABLE "${name}" (${parts.join(', ')})`;
}

const WMO_CODES = '0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99';

export class InitialSchema1795259262137 implements MigrationInterface {
  name = 'InitialSchema1795259262137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      createTable('location', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"slug" text NOT NULL',
        '"name" text NOT NULL',
        '"postal_code" text NOT NULL',
        '"region" text NOT NULL',
        '"latitude" real NOT NULL',
        '"longitude" real NOT NULL',
        `"timezone" text NOT NULL DEFAULT ('Europe/Berlin')`,
        '"is_default" boolean NOT NULL DEFAULT (0)',
        '"created_at" text NOT NULL',
        'CONSTRAINT "UQ_location_slug" UNIQUE ("slug")',
        'CONSTRAINT "CHK_location_longitude" CHECK ("longitude" BETWEEN -180 AND 180)',
        'CONSTRAINT "CHK_location_latitude" CHECK ("latitude" BETWEEN -90 AND 90)',
      ]),
    );

    await queryRunner.query(
      createTable('import', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"location_id" integer NOT NULL',
        '"kind" text NOT NULL',
        '"status" text NOT NULL',
        '"from_date" text NOT NULL',
        '"to_date" text NOT NULL',
        '"overwrite_corrections" boolean NOT NULL DEFAULT (0)',
        '"requested_by" integer',
        '"requested_at" text NOT NULL',
        '"started_at" text',
        '"finished_at" text',
        '"count_inserted" integer NOT NULL DEFAULT (0)',
        '"count_updated" integer NOT NULL DEFAULT (0)',
        '"count_unchanged" integer NOT NULL DEFAULT (0)',
        '"count_skipped_corrected" integer NOT NULL DEFAULT (0)',
        `"warnings_json" text NOT NULL DEFAULT ('[]')`,
        '"error_code" text',
        '"error_message" text',
        'CONSTRAINT "CHK_import_dates" CHECK ("from_date" <= "to_date")',
        `CONSTRAINT "CHK_import_status" CHECK ("status" IN ('queued','running','succeeded','partial','failed'))`,
        `CONSTRAINT "CHK_import_kind" CHECK ("kind" IN ('legacy','range','gaps','scheduled'))`,
        'CONSTRAINT "FK_import_location" FOREIGN KEY ("location_id") REFERENCES "location" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      ]),
    );
    // R19: höchstens ein laufender Import je Standort, auch bei zwei gleichzeitigen Anfragen.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_import_active" ON "import" ("location_id") WHERE "status" IN ('queued','running')`,
    );

    await queryRunner.query(
      createTable('daily_forecast', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"location_id" integer NOT NULL',
        '"date" text NOT NULL',
        '"max_temp" real',
        '"min_temp" real',
        '"precipitation_sum" real',
        '"weather_code" integer',
        '"fetched_at" text NOT NULL',
        '"import_id" integer',
        'CONSTRAINT "UQ_daily_forecast_location_date" UNIQUE ("location_id", "date")',
        'CONSTRAINT "CHK_daily_forecast_min_max" CHECK ("min_temp" IS NULL OR "max_temp" IS NULL OR "min_temp" <= "max_temp")',
        'CONSTRAINT "FK_daily_forecast_location" FOREIGN KEY ("location_id") REFERENCES "location" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
        'CONSTRAINT "FK_daily_forecast_import" FOREIGN KEY ("import_id") REFERENCES "import" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      ]),
    );

    await queryRunner.query(
      createTable('observation', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"location_id" integer NOT NULL',
        '"time_utc" text NOT NULL',
        '"local_date" text NOT NULL',
        '"local_hour" integer NOT NULL',
        '"utc_offset_min" integer NOT NULL',
        '"temperature" real',
        '"apparent_temperature" real',
        '"precipitation" real',
        '"weather_code" integer',
        '"wind_speed" real',
        '"wind_direction" integer',
        '"source" text NOT NULL',
        '"import_id" integer NOT NULL',
        '"fetched_at" text NOT NULL',
        '"corrected_at" text',
        '"version" integer NOT NULL DEFAULT (1)',
        '"updated_at" text NOT NULL',
        'CONSTRAINT "UQ_observation_location_time" UNIQUE ("location_id", "time_utc")',
        // R15: die 28 gültigen WMO-Codes.
        `CONSTRAINT "CHK_observation_weather_code" CHECK ("weather_code" IS NULL OR "weather_code" IN (${WMO_CODES}))`,
        // R16: dieselben Grenzen wie die Zod-Schemas der Korrektur.
        'CONSTRAINT "CHK_observation_wind_direction" CHECK ("wind_direction" IS NULL OR "wind_direction" BETWEEN 0 AND 360)',
        'CONSTRAINT "CHK_observation_wind_speed" CHECK ("wind_speed" IS NULL OR "wind_speed" BETWEEN 0 AND 300)',
        'CONSTRAINT "CHK_observation_precipitation" CHECK ("precipitation" IS NULL OR "precipitation" BETWEEN 0 AND 200)',
        'CONSTRAINT "CHK_observation_apparent_temperature" CHECK ("apparent_temperature" IS NULL OR "apparent_temperature" BETWEEN -70 AND 60)',
        'CONSTRAINT "CHK_observation_temperature" CHECK ("temperature" IS NULL OR "temperature" BETWEEN -50 AND 50)',
        'CONSTRAINT "CHK_observation_utc_offset" CHECK ("utc_offset_min" IN (60,120))',
        'CONSTRAINT "CHK_observation_local_hour" CHECK ("local_hour" BETWEEN 0 AND 23)',
        `CONSTRAINT "CHK_observation_source" CHECK ("source" IN ('archive','forecast_api','prediction'))`,
        'CONSTRAINT "FK_observation_location" FOREIGN KEY ("location_id") REFERENCES "location" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
        'CONSTRAINT "FK_observation_import" FOREIGN KEY ("import_id") REFERENCES "import" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      ]),
    );
    // Tagesabfragen (B4.5) und Datenrevision MAX(updated_at) (B2.4).
    await queryRunner.query(`CREATE INDEX "IDX_observation_updated_at" ON "observation" ("updated_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_observation_location_date" ON "observation" ("location_id", "local_date") `);

    await queryRunner.query(
      createTable('correction', [
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
      ]),
    );
    await queryRunner.query(`CREATE INDEX "IDX_correction_corrected_at" ON "correction" ("corrected_at") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_correction_corrected_at"`);
    await queryRunner.query(`DROP TABLE "correction"`);
    await queryRunner.query(`DROP INDEX "IDX_observation_location_date"`);
    await queryRunner.query(`DROP INDEX "IDX_observation_updated_at"`);
    await queryRunner.query(`DROP TABLE "observation"`);
    await queryRunner.query(`DROP TABLE "daily_forecast"`);
    await queryRunner.query(`DROP INDEX "UQ_import_active"`);
    await queryRunner.query(`DROP TABLE "import"`);
    await queryRunner.query(`DROP TABLE "location"`);
  }
}
