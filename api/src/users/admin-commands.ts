import { hashPassword, passwordProblem } from './password';
import type { UserAccount } from './user';
import { UserConflictError } from './users.service';
import type { UsersService } from './users.service';

/** Umgebungsvariable für das erste Passwort (03 B4.6): wird einmalig gelesen, danach wieder entfernen. */
export const ADMIN_INITIAL_PASSWORD = 'ADMIN_INITIAL_PASSWORD';

/** Abbruch eines Admin-Befehls (Exit-Code 1); die Datenbank bleibt unverändert. */
export class AdminCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminCommandError';
  }
}

export interface AdminCommandDeps {
  users: UsersService;
  env: NodeJS.ProcessEnv;
  /** Passwort verdeckt von stdin (`promptNewPassword`); in Tests ein fester Wert. */
  prompt: () => Promise<string>;
  now: () => Date;
  log: (line: string) => void;
}

function assertNewPassword(password: string): void {
  const problem = passwordProblem(password);
  if (problem) throw new AdminCommandError(problem);
}

/**
 * `cli admin:create --username <name>` (03 B4.6): erster Admin in der Sammel-DB bzw. in Produktion. Gibt es schon
 * einen Admin, bricht der Befehl **vor** der Passwortabfrage ab. Passwort aus `ADMIN_INITIAL_PASSWORD` (falls
 * gesetzt) oder verdeckt von stdin; mindestens 12 Zeichen, höchstens 72 Byte; gespeichert als bcrypt-Hash (12).
 */
export async function createAdmin(username: string, deps: AdminCommandDeps): Promise<UserAccount> {
  if ((await deps.users.countAdmins()) > 0) {
    throw new AdminCommandError('Es gibt schon einen Admin. Ein vergessenes Passwort setzt admin:set-password neu.');
  }
  if (await deps.users.findByUsername(username)) {
    throw new AdminCommandError(`Den Benutzernamen "${username}" gibt es schon.`);
  }
  const fromEnv = deps.env[ADMIN_INITIAL_PASSWORD];
  const password = fromEnv !== undefined && fromEnv !== '' ? fromEnv : await deps.prompt();
  assertNewPassword(password);
  try {
    const account = await deps.users.createAdmin(username, await hashPassword(password), deps.now());
    deps.log(`Admin "${account.username}" angelegt (id ${account.id}, Rolle admin).`);
    if (fromEnv) deps.log(`Passwort aus ${ADMIN_INITIAL_PASSWORD} gelesen. Die Variable jetzt wieder entfernen.`);
    return account;
  } catch (error) {
    if (error instanceof UserConflictError) throw new AdminCommandError(error.message);
    throw error;
  }
}

/**
 * `cli admin:set-password --username <name>` (03 B4.6, vergessenes Passwort; bewusst kein HTTP-Endpunkt):
 * neues Passwort verdeckt von stdin, gleiche Regeln wie `admin:create`. Unbekannter Name → Abbruch.
 * Bereits ausgestellte Tokens bleiben bis zu ihrem Ablauf gültig (kein `token_version`, 03 B4.6).
 */
export async function setAdminPassword(username: string, deps: AdminCommandDeps): Promise<void> {
  if (!(await deps.users.findByUsername(username))) {
    throw new AdminCommandError(`Den Benutzernamen "${username}" gibt es nicht.`);
  }
  const password = await deps.prompt();
  assertNewPassword(password);
  await deps.users.setPasswordHash(username, await hashPassword(password));
  deps.log(`Passwort für "${username}" neu gesetzt.`);
}
