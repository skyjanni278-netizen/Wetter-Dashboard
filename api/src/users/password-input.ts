import type { Readable, Writable } from 'node:stream';

/** Eingabe mit Strg+C abgebrochen. */
export class PasswordInputAborted extends Error {
  constructor() {
    super('Eingabe abgebrochen.');
    this.name = 'PasswordInputAborted';
  }
}

/** Ein- und Ausgabe für die Passwortabfrage (`process.stdin`, `process.stderr`; in Tests Streams). */
export interface PasswordIo {
  input: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  output: Writable;
}

/**
 * Liest eine Zeile verdeckt vom Terminal (Raw-Modus, kein Echo): Enter beendet, Backspace löscht ein Zeichen,
 * Strg+C bricht ab. Danach ist der Raw-Modus wieder aus und `input` pausiert.
 */
function readHiddenLine(io: PasswordIo, prompt: string): Promise<string> {
  const { input, output } = io;
  return new Promise((resolve, reject) => {
    let value = '';
    output.write(prompt);
    const finish = (): void => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
      output.write('\n');
    };
    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString()) {
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new PasswordInputAborted());
          return;
        }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else value += char;
      }
    };
    input.setRawMode?.(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/**
 * Erste Zeile von einer Umleitung (`echo … | npm run cli -- …`, Tests): ohne Zeilenende (`\n` oder `\r\n`), sonst
 * unverändert (Leerzeichen gehören zum Passwort). Leere Eingabe → `null`. Danach pausiert `input`.
 */
export function readFirstLine(input: Readable): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const finish = (value: string | null): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      input.pause();
      resolve(value);
    };
    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const end = buffer.search(/\r?\n/);
      if (end >= 0) finish(buffer.slice(0, end));
    };
    const onEnd = (): void => finish(buffer === '' ? null : buffer);
    const onError = (error: Error): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      reject(error);
    };
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onError);
    input.resume();
  });
}

/**
 * Neues Passwort von stdin (03 B4.6, „verdeckt eingegeben“): im Terminal verdeckt und zur Kontrolle zweimal;
 * bei einer Umleitung die erste Zeile. Fehlt die Eingabe oder stimmen beide nicht überein → Fehler.
 */
export async function promptNewPassword(io: PasswordIo): Promise<string> {
  if (io.input.isTTY && io.input.setRawMode) {
    const first = await readHiddenLine(io, 'Neues Passwort (wird nicht angezeigt): ');
    const second = await readHiddenLine(io, 'Passwort wiederholen: ');
    if (first !== second) throw new Error('Die beiden Eingaben stimmen nicht überein.');
    return first;
  }
  const line = await readFirstLine(io.input);
  if (line === null) throw new Error('Kein Passwort auf stdin.');
  return line;
}
