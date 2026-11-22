import type { User } from './user.entity';

/** Angemeldeter Benutzer aus dem Token (`request.user`, 03 B4.3): `sub`, Name, Rollen. */
export interface AuthUser {
  sub: number;
  username: string;
  roles: string[];
}

/** Benutzer in der Token-Antwort (03 B2.2 „token“). */
export interface TokenUser {
  id: number;
  username: string;
  roles: string[];
}

/** Antwort von `GET /api/auth/me` (03 B2.2 „user“). `passwordHash` kommt nie vor. */
export interface UserResource {
  id: number;
  username: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Konto mit Rollen, wie es der `UsersService` liefert (ohne Hash). */
export interface UserAccount {
  id: number;
  username: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
}

/** Konto für die Anmeldung, nur hier mit Hash (`select: false` ausdrücklich aufgehoben). */
export interface LoginAccount extends UserAccount {
  passwordHash: string;
}

/** Rollen einer Entity mit geladenen `userRoles.role`, sortiert. */
export function rolesOf(user: User): string[] {
  return (user.userRoles ?? []).map(ur => ur.role?.name).filter((name): name is string => !!name).sort();
}

/** Mapper `GET /api/auth/me`: nur die erlaubten Felder, explizit (03 B4.6, kein `return entity`). */
export function toUserResource(account: UserAccount): UserResource {
  return {
    id: account.id,
    username: account.username,
    roles: [...account.roles],
    isActive: account.isActive,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
  };
}

/** Mapper für `user` in der Token-Antwort. */
export function toTokenUser(account: UserAccount): TokenUser {
  return { id: account.id, username: account.username, roles: [...account.roles] };
}
