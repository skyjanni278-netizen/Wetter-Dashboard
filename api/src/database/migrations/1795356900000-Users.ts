import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schritt 10 (03 B2.3, B2.6, B4.6): Admin-Konten nach dem Kursmuster user/role/user_role. Absicherung wie im
 * Datenmodell: `UNIQUE(username)`, `UNIQUE(name)`, `PRIMARY KEY(user_id, role_id)`, beide Fremdschlüssel mit
 * `ON DELETE CASCADE`. Von Hand geschrieben mit denselben Constraint-Namen wie die Entities; jede Tabelle in
 * **einer** SQL-Zeile (wie `InitialSchema`), damit `migration:generate` danach keinen Unterschied findet.
 */
function createTable(name: string, parts: readonly string[]): string {
  return `CREATE TABLE "${name}" (${parts.join(', ')})`;
}

export class Users1795356900000 implements MigrationInterface {
  name = 'Users1795356900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      createTable('user', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"username" text NOT NULL',
        '"password_hash" text NOT NULL',
        '"is_active" boolean NOT NULL DEFAULT (1)',
        '"created_at" text NOT NULL',
        '"last_login_at" text',
        'CONSTRAINT "UQ_user_username" UNIQUE ("username")',
      ]),
    );

    await queryRunner.query(
      createTable('role', [
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL',
        '"name" text NOT NULL',
        '"description" text NOT NULL',
        'CONSTRAINT "UQ_role_name" UNIQUE ("name")',
      ]),
    );

    await queryRunner.query(
      createTable('user_role', [
        '"user_id" integer NOT NULL',
        '"role_id" integer NOT NULL',
        '"assigned_at" text NOT NULL',
        'CONSTRAINT "FK_user_role_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION',
        'CONSTRAINT "FK_user_role_role" FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE NO ACTION',
        'PRIMARY KEY ("user_id", "role_id")',
      ]),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_role"`);
    await queryRunner.query(`DROP TABLE "role"`);
    await queryRunner.query(`DROP TABLE "user"`);
  }
}
