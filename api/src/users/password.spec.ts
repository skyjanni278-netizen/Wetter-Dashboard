import {
  BCRYPT_COST,
  costOf,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
  verifyPassword,
} from './password';

describe('Passwörter (03 B4.6)', () => {
  it('Regeln: mindestens 12 Zeichen, höchstens 72 Byte', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(MAX_PASSWORD_BYTES).toBe(72);
    expect(passwordProblem('a'.repeat(11))).toMatch(/mindestens 12 Zeichen/);
    expect(passwordProblem('a'.repeat(12))).toBeNull();
    expect(passwordProblem('a'.repeat(72))).toBeNull();
    expect(passwordProblem('a'.repeat(73))).toMatch(/höchstens 72 Byte/);
    // 36 × „ä“ = 72 Byte (gültig), 37 × = 74 Byte; Zeichen zählen als Codepoints (ein Emoji = 1 Zeichen).
    expect(passwordProblem('ä'.repeat(36))).toBeNull();
    expect(passwordProblem('ä'.repeat(37))).toMatch(/72 Byte/);
    expect(passwordProblem('😀'.repeat(11))).toMatch(/mindestens 12 Zeichen/);
    expect(passwordProblem('😀'.repeat(12))).toBeNull();
  });

  it('Dummy-Hash hat dieselben Kosten wie neue Hashes (12), sonst verriete die Laufzeit unbekannte Namen', () => {
    expect(BCRYPT_COST).toBe(12);
    expect(costOf(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  });

  it('hashPassword/verifyPassword: richtig → true, falsch → false; Hash nie im Klartext', async () => {
    const hash = await hashPassword('ein-langes-passwort', 4);
    expect(costOf(hash)).toBe(4);
    expect(hash).not.toContain('ein-langes-passwort');
    await expect(verifyPassword('ein-langes-passwort', hash)).resolves.toBe(true);
    await expect(verifyPassword('ein-anderes-passwort', hash)).resolves.toBe(false);
    await expect(verifyPassword('', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });

  it('Standardkosten von hashPassword sind 12', async () => {
    expect(costOf(await hashPassword('ein-langes-passwort'))).toBe(12);
  });
});
