import { PassThrough } from 'node:stream';
import { PasswordInputAborted, promptNewPassword, readFirstLine } from './password-input';

/** Terminal-Ersatz: `isTTY` und `setRawMode` wie `process.stdin` an einer Konsole. */
function fakeTty() {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: jest.fn() });
  const output = new PassThrough();
  let written = '';
  output.on('data', chunk => (written += chunk.toString()));
  return { input, output, written: () => written };
}

describe('Passwortabfrage der CLI (03 B4.6: verdeckt von stdin)', () => {
  it('Umleitung: erste Zeile ohne Zeilenende, Leerzeichen bleiben; ohne Zeilenende bis EOF; leer → null', async () => {
    const piped = new PassThrough();
    const line = readFirstLine(piped);
    piped.end(' mit Leerzeichen \r\nzweite Zeile\n');
    await expect(line).resolves.toBe(' mit Leerzeichen ');

    const noNewline = new PassThrough();
    const rest = readFirstLine(noNewline);
    noNewline.end('ohne-zeilenende');
    await expect(rest).resolves.toBe('ohne-zeilenende');

    const empty = new PassThrough();
    const nothing = readFirstLine(empty);
    empty.end();
    await expect(nothing).resolves.toBeNull();
  });

  it('promptNewPassword ohne Terminal: eine Zeile; keine Eingabe → Fehler', async () => {
    const input = new PassThrough();
    const result = promptNewPassword({ input, output: new PassThrough() });
    input.end('aus-der-pipe-42\n');
    await expect(result).resolves.toBe('aus-der-pipe-42');

    const none = new PassThrough();
    const missing = promptNewPassword({ input: none, output: new PassThrough() });
    none.end();
    await expect(missing).rejects.toThrow(/Kein Passwort/);
  });

  it('Terminal: verdeckt (kein Echo), Backspace, zweimal; Raw-Modus danach wieder aus', async () => {
    const tty = fakeTty();
    const result = promptNewPassword(tty);
    tty.input.write('geheimX\u007f-passwort\r');
    await new Promise(resolve => setImmediate(resolve));
    tty.input.write('geheim-passwort\r');
    await expect(result).resolves.toBe('geheim-passwort');
    expect(tty.written()).not.toContain('geheim');
    expect(tty.written()).toContain('Passwort wiederholen');
    expect(tty.input.setRawMode.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('Terminal: Eingaben verschieden → Fehler; Strg+C → PasswordInputAborted', async () => {
    const tty = fakeTty();
    const mismatch = promptNewPassword(tty);
    tty.input.write('erstes-passwort\r');
    await new Promise(resolve => setImmediate(resolve));
    tty.input.write('zweites-passwort\r');
    await expect(mismatch).rejects.toThrow(/stimmen nicht überein/);

    const abort = fakeTty();
    const aborted = promptNewPassword(abort);
    abort.input.write('abc\u0003');
    await expect(aborted).rejects.toThrow(PasswordInputAborted);
  });
});
