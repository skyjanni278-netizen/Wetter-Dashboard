import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import { AdminCommandError, createAdmin, setAdminPassword } from './admin-commands';
import type { AdminCommandDeps } from './admin-commands';
import { costOf, verifyPassword } from './password';
import { User } from './user.entity';
import { UsersService } from './users.service';

const PASSWORD = 'ein-langes-passwort';

describe('CLI admin:create und admin:set-password (03 B4.6)', () => {
  let dataSource: DataSource;
  let users: UsersService;
  let lines: string[];

  function deps(options: { env?: NodeJS.ProcessEnv; input?: string } = {}): AdminCommandDeps & { prompt: jest.Mock } {
    return {
      users,
      env: options.env ?? {},
      prompt: jest.fn(async () => options.input ?? PASSWORD),
      now: () => new Date('2026-11-22T10:00:00Z'),
      log: line => lines.push(line),
    };
  }

  beforeEach(async () => {
    dataSource = await openTestDatabase();
    users = new UsersService(dataSource.getRepository(User));
    lines = [];
  });
  afterEach(() => dataSource.destroy());

  it('admin:create mit Passwort von stdin: Konto mit Rolle admin, bcrypt-Kosten 12', async () => {
    const d = deps();
    const account = await createAdmin('admin', d);
    expect(account).toMatchObject({ id: 1, username: 'admin', roles: ['admin'] });
    expect(d.prompt).toHaveBeenCalledTimes(1);
    const { passwordHash } = (await users.findForLogin('admin'))!;
    expect(costOf(passwordHash)).toBe(12);
    await expect(verifyPassword(PASSWORD, passwordHash)).resolves.toBe(true);
    expect(lines).toEqual(['Admin "admin" angelegt (id 1, Rolle admin).']);
  });

  it('admin:create mit ADMIN_INITIAL_PASSWORD: keine Abfrage, Hinweis zum Entfernen der Variable', async () => {
    const d = deps({ env: { ADMIN_INITIAL_PASSWORD: 'aus-der-umgebung-42' } });
    await createAdmin('admin', d);
    expect(d.prompt).not.toHaveBeenCalled();
    await expect(verifyPassword('aus-der-umgebung-42', (await users.findForLogin('admin'))!.passwordHash)).resolves.toBe(true);
    expect(lines[1]).toMatch(/ADMIN_INITIAL_PASSWORD gelesen.*entfernen/);
  });

  it('zweiter Aufruf → Abbruch vor der Passwortabfrage, es bleibt ein Admin', async () => {
    await createAdmin('admin', deps());
    const d = deps();
    await expect(createAdmin('zweiter', d)).rejects.toThrow(AdminCommandError);
    await expect(createAdmin('zweiter', d)).rejects.toThrow(/schon einen Admin/);
    expect(d.prompt).not.toHaveBeenCalled();
    expect(await users.countAdmins()).toBe(1);
  });

  it.each([
    ['11 Zeichen', 'kurz-123456', /mindestens 12 Zeichen/],
    ['73 Byte', 'a'.repeat(73), /höchstens 72 Byte/],
  ])('Passwort %s → Abbruch, kein Konto', async (_name, input, message) => {
    await expect(createAdmin('admin', deps({ input }))).rejects.toThrow(message);
    await expect(createAdmin('admin', deps({ env: { ADMIN_INITIAL_PASSWORD: input } }))).rejects.toThrow(AdminCommandError);
    expect(await users.findByUsername('admin')).toBeNull();
  });

  it('admin:set-password: neues Passwort für bekannten Namen; unbekannter Name → Abbruch ohne Abfrage', async () => {
    await createAdmin('admin', deps());
    await setAdminPassword('admin', deps({ input: 'ein-neues-langes-passwort' }));
    const { passwordHash } = (await users.findForLogin('admin'))!;
    await expect(verifyPassword('ein-neues-langes-passwort', passwordHash)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, passwordHash)).resolves.toBe(false);
    expect(lines).toContain('Passwort für "admin" neu gesetzt.');

    const d = deps();
    await expect(setAdminPassword('niemand', d)).rejects.toThrow(/gibt es nicht/);
    expect(d.prompt).not.toHaveBeenCalled();
  });

  it('admin:set-password mit zu kurzem Passwort → Abbruch, altes Passwort bleibt; ADMIN_INITIAL_PASSWORD wirkt nicht', async () => {
    await createAdmin('admin', deps());
    await expect(setAdminPassword('admin', deps({ input: 'zu-kurz', env: { ADMIN_INITIAL_PASSWORD: 'aus-der-umgebung-42' } }))).rejects.toThrow(
      /mindestens 12 Zeichen/,
    );
    await expect(verifyPassword(PASSWORD, (await users.findForLogin('admin'))!.passwordHash)).resolves.toBe(true);
  });
});
