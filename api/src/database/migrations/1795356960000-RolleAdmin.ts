import type { MigrationInterface, QueryRunner } from 'typeorm';
import { ADMIN_ROLE, ADMIN_ROLE_DESCRIPTION } from '../../users/role.entity';

/**
 * Daten-Migration (03 B4.4): Die Rolle `admin` ist ein Stammdatum wie der Standort Heubach und muss auch in
 * Produktion da sein. Idempotent (`ON CONFLICT DO NOTHING`). Ein Konto entsteht nicht hier, sondern per
 * `npm run cli -- admin:create` bzw. in der Dev-DB per `db:seed` mit `DEV_ADMIN_PASSWORD`.
 */
export class RolleAdmin1795356960000 implements MigrationInterface {
  name = 'RolleAdmin1795356960000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "role" ("name", "description") VALUES (?, ?) ON CONFLICT DO NOTHING`, [
      ADMIN_ROLE,
      ADMIN_ROLE_DESCRIPTION,
    ]);
  }

  /** Löscht über `ON DELETE CASCADE` auch die Zuordnungen; die Konten bleiben (dann ohne Rolle). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role" WHERE "name" = ?`, [ADMIN_ROLE]);
  }
}
