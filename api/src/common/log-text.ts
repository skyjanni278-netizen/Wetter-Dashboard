/** Längste Länge eines Werts aus einer Anfrage im Log. */
const MAX_LOG_TEXT = 100;

/** Steuerzeichen (C0, DEL, C1) und die Unicode-Zeilentrenner U+2028/U+2029. */
const LINE_BREAKING = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * Text aus einer Anfrage (z. B. Benutzername) für eine Log-Zeile (C1 A05, Log Injection): Steuerzeichen und
 * Zeilenumbrüche werden zu Leerzeichen, lange Werte gekürzt. So kann niemand eine zweite Log-Zeile vortäuschen.
 */
export function logText(value: string): string {
  const flat = value.replace(LINE_BREAKING, ' ');
  return flat.length > MAX_LOG_TEXT ? `${flat.slice(0, MAX_LOG_TEXT)}…` : flat;
}
