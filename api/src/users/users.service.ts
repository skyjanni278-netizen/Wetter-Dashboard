import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { formatUtc } from '../common/utc';
import { ADMIN_ROLE, Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { User } from './user.entity';
import { rolesOf } from './user';
import type { LoginAccount, UserAccount } from './user';

function toAccount(user: User): UserAccount {
  return {
    id: user.id,
    username: user.username,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    roles: rolesOf(user),
  };
}

/** Konto anlegen geht nicht (03 B4.6): Es gibt schon einen Admin, oder der Name ist vergeben. */
export class UserConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserConflictError';
  }
}

/**
 * Admin-Konten (03 B4.1 `UsersModule`): liest und schreibt `user`, `role`, `user_role`. Den Hash liest nur
 * `findForLogin` (Spalte mit `select: false`); Hashen und Passwortregeln liegen in `password.ts`.
 * Auch ohne Nest nutzbar (CLI, Seed): `new UsersService(dataSource.getRepository(User))`.
 */
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  private withRoles(users: Repository<User> = this.users) {
    return users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role');
  }

  /** Konto mit Hash für die Anmeldung; `username` ist schon normalisiert (`UsernameSchema`). */
  async findForLogin(username: string): Promise<LoginAccount | null> {
    const user = await this.withRoles()
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username })
      .getOne();
    return user ? { ...toAccount(user), passwordHash: user.passwordHash } : null;
  }

  async findById(id: number): Promise<UserAccount | null> {
    const user = await this.withRoles().where('user.id = :id', { id }).getOne();
    return user ? toAccount(user) : null;
  }

  async findByUsername(username: string): Promise<UserAccount | null> {
    const user = await this.withRoles().where('user.username = :username', { username }).getOne();
    return user ? toAccount(user) : null;
  }

  /** Anzahl der Konten mit Rolle `admin`. */
  countAdmins(): Promise<number> {
    return this.countAdminsWith(this.users);
  }

  async recordLogin(id: number, at: Date): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: formatUtc(at) });
  }

  /**
   * `admin:create` (03 B4.6): Konto mit Rolle `admin` in **einer** Transaktion. Bricht ab, wenn es schon einen
   * Admin gibt oder der Name vergeben ist. Die Rolle kommt aus der Daten-Migration `RolleAdmin`.
   */
  async createAdmin(username: string, passwordHash: string, now: Date): Promise<UserAccount> {
    const id = await this.users.manager.transaction(async manager => {
      const users = manager.getRepository(User);
      if ((await this.countAdminsWith(users)) > 0) {
        throw new UserConflictError('Es gibt schon einen Admin. Ein vergessenes Passwort setzt admin:set-password neu.');
      }
      if (await users.existsBy({ username })) {
        throw new UserConflictError(`Den Benutzernamen "${username}" gibt es schon.`);
      }
      return this.insertAdmin(manager, { username, passwordHash, now });
    });
    return (await this.findById(id))!;
  }

  /**
   * Dev-Seed (03 B4.4): Konto `username` mit Rolle `admin` anlegen oder sein Passwort ersetzen (wieder aktiv).
   * Andere Konten bleiben unberührt. Nur für die Dev-DB (`db:seed`), nie für die Sammel-DB.
   */
  async upsertAdmin(username: string, passwordHash: string, now: Date): Promise<'created' | 'updated'> {
    return this.users.manager.transaction(async manager => {
      const users = manager.getRepository(User);
      const existing = await users.findOneBy({ username });
      if (!existing) {
        await this.insertAdmin(manager, { username, passwordHash, now });
        return 'created';
      }
      await users.update({ id: existing.id }, { passwordHash, isActive: true });
      const role = await this.adminRole(manager);
      await manager
        .getRepository(UserRole)
        .createQueryBuilder()
        .insert()
        .values({ userId: existing.id, roleId: role.id, assignedAt: formatUtc(now) })
        .orIgnore()
        .execute();
      return 'updated';
    });
  }

  /** `admin:set-password`: neuer Hash; `false`, wenn es den Namen nicht gibt. */
  async setPasswordHash(username: string, passwordHash: string): Promise<boolean> {
    const result = await this.users.update({ username }, { passwordHash });
    return (result.affected ?? 0) > 0;
  }

  private countAdminsWith(users: Repository<User>): Promise<number> {
    return users
      .createQueryBuilder('user')
      .innerJoin('user.userRoles', 'userRole')
      .innerJoin('userRole.role', 'role', 'role.name = :name', { name: ADMIN_ROLE })
      .getCount();
  }

  private async adminRole(manager: EntityManager): Promise<Role> {
    const role = await manager.getRepository(Role).findOneBy({ name: ADMIN_ROLE });
    if (!role) throw new Error(`Die Rolle "${ADMIN_ROLE}" fehlt. Zuerst npm run migration:run.`);
    return role;
  }

  private async insertAdmin(
    manager: EntityManager,
    values: { username: string; passwordHash: string; now: Date },
  ): Promise<number> {
    const role = await this.adminRole(manager);
    const users = manager.getRepository(User);
    const at = formatUtc(values.now);
    const user = await users.save(
      users.create({ username: values.username, passwordHash: values.passwordHash, isActive: true, createdAt: at, lastLoginAt: null }),
    );
    await manager.getRepository(UserRole).insert({ userId: user.id, roleId: role.id, assignedAt: at });
    return user.id;
  }
}
