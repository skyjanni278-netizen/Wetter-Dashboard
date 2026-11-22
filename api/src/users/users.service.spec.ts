import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import { hashPassword, verifyPassword } from './password';
import { User } from './user.entity';
import { UserConflictError, UsersService } from './users.service';

const NOW = new Date('2026-11-22T10:00:00Z');

describe('UsersService und Tabellen user/role/user_role (03 B2.3, B2.6)', () => {
  let dataSource: DataSource;
  let users: UsersService;
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword('ein-langes-passwort', 4);
  });
  beforeEach(async () => {
    dataSource = await openTestDatabase();
    users = new UsersService(dataSource.getRepository(User));
  });
  afterEach(() => dataSource.destroy());

  it('Daten-Migration RolleAdmin: genau die Rolle admin (id 1), kein Konto', async () => {
    expect(await dataSource.query('SELECT "id", "name", "description" FROM "role"')).toEqual([
      { id: 1, name: 'admin', description: 'Datenimport, Korrekturen, Protokolle' },
    ]);
    expect(await dataSource.query('SELECT COUNT(*) AS "n" FROM "user"')).toEqual([{ n: 0 }]);
    expect(await users.countAdmins()).toBe(0);
  });

  it('createAdmin: Konto mit Rolle admin; zweiter Admin oder vergebener Name → UserConflictError', async () => {
    const account = await users.createAdmin('admin', hash, NOW);
    expect(account).toEqual({ id: 1, username: 'admin', isActive: true, createdAt: '2026-11-22T10:00:00Z', lastLoginAt: null, roles: ['admin'] });
    expect(await users.countAdmins()).toBe(1);
    await expect(users.createAdmin('zweiter', hash, NOW)).rejects.toThrow(UserConflictError);
    expect(await dataSource.query('SELECT "user_id", "role_id", "assigned_at" FROM "user_role"')).toEqual([
      { user_id: 1, role_id: 1, assigned_at: '2026-11-22T10:00:00Z' },
    ]);
  });

  it('password_hash hat select: false: nur findForLogin liefert ihn', async () => {
    await users.createAdmin('admin', hash, NOW);
    const plain = await dataSource.getRepository(User).findOneByOrFail({ username: 'admin' });
    expect(plain.passwordHash).toBeUndefined();
    expect(await users.findById(1)).not.toHaveProperty('passwordHash');
    expect(await users.findByUsername('admin')).not.toHaveProperty('passwordHash');
    expect((await users.findForLogin('admin'))!.passwordHash).toBe(hash);
    expect(await users.findForLogin('niemand')).toBeNull();
  });

  it('Absicherung der DB: UNIQUE(username), UNIQUE(role.name), PRIMARY KEY(user_id, role_id), FK, ON DELETE CASCADE', async () => {
    await users.createAdmin('admin', hash, NOW);
    const insertUser = (name: string) =>
      dataSource.query(`INSERT INTO "user" ("username", "password_hash", "created_at") VALUES (?, 'x', '2026-11-22T10:00:00Z')`, [name]);
    await expect(insertUser('admin')).rejects.toThrow(/UNIQUE constraint failed: user.username/);
    await expect(dataSource.query(`INSERT INTO "role" ("name", "description") VALUES ('admin', 'x')`)).rejects.toThrow(
      /UNIQUE constraint failed: role.name/,
    );
    const assign = (userId: number, roleId: number) =>
      dataSource.query(`INSERT INTO "user_role" ("user_id", "role_id", "assigned_at") VALUES (?, ?, '2026-11-22T10:00:00Z')`, [userId, roleId]);
    await expect(assign(1, 1)).rejects.toThrow(/UNIQUE constraint failed: user_role.user_id, user_role.role_id/);
    await expect(assign(99, 1)).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(assign(1, 99)).rejects.toThrow(/FOREIGN KEY constraint failed/);

    await dataSource.query(`DELETE FROM "user" WHERE "id" = 1`);
    expect(await dataSource.query('SELECT COUNT(*) AS "n" FROM "user_role"')).toEqual([{ n: 0 }]);
    expect(await dataSource.query('SELECT COUNT(*) AS "n" FROM "role"')).toEqual([{ n: 1 }]);
  });

  it('upsertAdmin (Dev-Seed): erst angelegt, dann Passwort ersetzt und wieder aktiv', async () => {
    expect(await users.upsertAdmin('admin', hash, NOW)).toBe('created');
    await dataSource.query(`UPDATE "user" SET "is_active" = 0`);
    const other = await hashPassword('noch-ein-langes-passwort', 4);
    expect(await users.upsertAdmin('admin', other, NOW)).toBe('updated');
    const account = (await users.findForLogin('admin'))!;
    expect(account).toMatchObject({ isActive: true, roles: ['admin'] });
    await expect(verifyPassword('noch-ein-langes-passwort', account.passwordHash)).resolves.toBe(true);
    expect(await users.countAdmins()).toBe(1);
  });

  it('setPasswordHash: true für bekannten, false für unbekannten Namen; recordLogin setzt last_login_at', async () => {
    await users.createAdmin('admin', hash, NOW);
    expect(await users.setPasswordHash('admin', 'neu')).toBe(true);
    expect(await users.setPasswordHash('niemand', 'neu')).toBe(false);
    await users.recordLogin(1, new Date('2026-11-22T11:00:00.123Z'));
    expect((await users.findById(1))!.lastLoginAt).toBe('2026-11-22T11:00:00Z');
  });
});
