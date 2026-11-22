import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FIXTURE_DIR, FixtureConfigError, loadFixture } from './fixture';

describe('Fixtures (db:seed --fixture, e2e-Tests)', () => {
  it.each(['us16-ok', 'us16-delayed', 'us20-frost', 'us06-records', 'us02-dst'])(
    'die mitgelieferte Fixture %s ist gültig',
    name => {
      expect(loadFixture(name, FIXTURE_DIR).name).toBe(name);
    },
  );

  it('unbekannter Name → Fehler mit den vorhandenen Fixtures', () => {
    expect(() => loadFixture('gibtsnicht')).toThrow(FixtureConfigError);
    expect(() => loadFixture('gibtsnicht')).toThrow(/Vorhanden: .*us16-ok/);
  });

  it('Pfadangaben im Namen sind verboten', () => {
    expect(() => loadFixture('../secret')).toThrow(/kein gültiger Name/);
  });

  describe('ungültige Datei', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'wetter-fixture-'));
      await writeFile(path.join(dir, 'kaputt.json'), '{');
      await writeFile(
        path.join(dir, 'halb.json'),
        JSON.stringify({ name: 'halb', description: '', fakeNow: null, observations: [{ timeUtc: '2026-11-19T13:30:00Z' }], imports: [], forecast: null }),
      );
    });
    afterAll(() => rm(dir, { recursive: true, force: true }));

    it('kein JSON → Startfehler', () => {
      expect(() => loadFixture('kaputt', dir)).toThrow(/kein gültiges JSON/);
    });

    it('Schema verletzt (keine volle Stunde, Felder fehlen) → Startfehler mit Pfad', () => {
      expect(() => loadFixture('halb', dir)).toThrow(/ungültig an observations\.0\.timeUtc/);
    });
  });
});
