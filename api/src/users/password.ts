import { compare, hash } from 'bcryptjs';

/** bcrypt-Kosten (03 B4.6): 12, auf dem Pi zu messen (sonst 11). Gilt für jedes neue Passwort. */
export const BCRYPT_COST = 12;

/** Regeln für neue Passwörter (03 B4.6): mindestens 12 Zeichen, höchstens 72 Byte (Grenze von bcrypt). */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

/**
 * Fester bcrypt-Hash (Kosten 12) eines zufälligen, verworfenen Werts. Bei unbekanntem Benutzernamen läuft
 * `compare` gegen diesen Hash, damit die Antwortzeit nicht verrät, ob ein Konto existiert (US09-3, 03 B4.6).
 * Die Kosten müssen dieselben sein wie bei `hashPassword`; der Unit-Test prüft das.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$zLCUjhIJxwyr6IhGTyp3xu0MP2HfrlA3OWmtm/sZAbP/zmpbo9qoC';

export function passwordBytes(password: string): number {
  return Buffer.byteLength(password, 'utf8');
}

/** Problem eines neuen Passworts als deutscher Text, `null` = in Ordnung. Zeichen = Unicode-Codepoints. */
export function passwordProblem(password: string): string | null {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`;
  }
  if (passwordBytes(password) > MAX_PASSWORD_BYTES) {
    return `Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte haben (bcrypt).`;
  }
  return null;
}

/** bcrypt-Hash eines neuen Passworts; die Regeln prüft der Aufrufer vorher (`passwordProblem`). */
export function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  return hash(password, cost);
}

/** Vergleicht ein Passwort mit einem bcrypt-Hash (Laufzeit hängt nur von den Kosten des Hashs ab). */
export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/** Kosten eines bcrypt-Hashs (`$2b$12$…` → 12). */
export function costOf(passwordHash: string): number {
  return Number.parseInt(passwordHash.split('$')[2] ?? '', 10);
}
