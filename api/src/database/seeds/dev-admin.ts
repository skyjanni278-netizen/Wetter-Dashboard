import type { DataSource } from 'typeorm';
import { hashPassword, passwordProblem } from '../../users/password';
import { User } from '../../users/user.entity';
import { UsersService } from '../../users/users.service';

/** Name des Dev-Admins (03 B4.4, B4.6); in der Sammel-DB und in Produktion entsteht der Admin per `admin:create`. */
export const DEV_ADMIN_USERNAME = 'admin';

export type DevAdminResult =
  | { status: 'created' | 'updated'; username: string }
  | { status: 'skipped'; reason: string };

/** Hinweis im Log, wenn kein Dev-Admin angelegt wird. */
export const DEV_ADMIN_SKIPPED =
  'kein Dev-Admin angelegt: DEV_ADMIN_PASSWORD ist nicht gesetzt (mindestens 12 Zeichen, höchstens 72 Byte).';

/**
 * `DEV_ADMIN_PASSWORD` (03 B4.8, Übergang aus `process.env`): fehlt oder leer → `null` (kein Admin). Verletzt es
 * die Regeln für neue Passwörter, bricht `db:seed`/`db:reset` **vor** jeder Änderung ab.
 */
export function devAdminPasswordFromEnv(env: NodeJS.ProcessEnv): string | null {
  const password = env['DEV_ADMIN_PASSWORD'];
  if (password === undefined || password === '') return null;
  const problem = passwordProblem(password);
  if (problem) throw new Error(`DEV_ADMIN_PASSWORD ungültig: ${problem}`);
  return password;
}

/**
 * Dev-Seed-Admin (03 B4.4): legt `admin` mit Rolle `admin` an oder setzt sein Passwort neu (bcrypt, Kosten 12).
 * Läuft nur aus `runSeed`/`runReset`, also nach deren Schutzregeln (nicht in Produktion, nicht bei gesammelten
 * Daten ohne `--force-delete-collected-data`).
 */
export async function seedDevAdmin(dataSource: DataSource, password: string | null, now: Date): Promise<DevAdminResult> {
  if (password === null) return { status: 'skipped', reason: DEV_ADMIN_SKIPPED };
  const users = new UsersService(dataSource.getRepository(User));
  const status = await users.upsertAdmin(DEV_ADMIN_USERNAME, await hashPassword(password), now);
  return { status, username: DEV_ADMIN_USERNAME };
}
