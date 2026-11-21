import type { MigrationInterface, QueryRunner } from 'typeorm';
import { HEUBACH } from '../../locations/location';

/**
 * Daten-Migration (03 B4.4): der Standort Heubach ist ein Stammdatum, kein Beispieldatum, und muss auch in
 * Produktion da sein. Idempotent (`ON CONFLICT DO NOTHING`); `id = 1` wie die Konstante `HEUBACH`, auf die
 * sich die Module bis zum Locations-Repository beziehen. Die Rolle `admin` folgt mit Schritt 10.
 */
export class Stammdaten1795259300000 implements MigrationInterface {
  name = 'Stammdaten1795259300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "location" ("id", "slug", "name", "postal_code", "region", "latitude", "longitude", "timezone", "is_default", "created_at")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT DO NOTHING`,
      [
        HEUBACH.id,
        HEUBACH.slug,
        HEUBACH.name,
        HEUBACH.postalCode,
        HEUBACH.region,
        HEUBACH.latitude,
        HEUBACH.longitude,
        HEUBACH.timezone,
      ],
    );
  }

  /** Scheitert absichtlich am Fremdschlüssel, solange Stunden, Vorhersagen oder Importe darauf zeigen. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "location" WHERE "slug" = ?`, [HEUBACH.slug]);
  }
}
