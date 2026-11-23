import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FIXTURE_DIR, FixtureConfigError, loadFixture } from './fixture';

describe('Fixtures (db:seed --fixture, e2e-Tests)', () => {
  it.each(['us16-ok', 'us16-delayed', 'us20-frost', 'us06-records', 'us02-dst', 'us06-corrected'])(
    'die mitgelieferte Fixture %s ist gültig',
    name => {
      expect(loadFixture(name, FIXTURE_DIR).name).toBe(name);
    },
  );

  it('us06-corrected (Schritt 12a): Werte der Stunden = newValue der Korrekturen; die korrigierte Stunde ist die kälteste', () => {
    const fixture = loadFixture('us06-corrected');
    expect(fixture.corrections).toHaveLength(2);
    for (const correction of fixture.corrections ?? []) {
      const hour = fixture.observations.find(o => o.timeUtc === correction.timeUtc);
      expect([correction.timeUtc, hour?.[correction.field]]).toEqual([correction.timeUtc, correction.newValue]);
    }
    const past = fixture.observations.filter(o => o.source !== 'prediction' && o.temperature !== null);
    const coldest = past.reduce((a, b) => (b.temperature! < a.temperature! ? b : a));
    expect(coldest).toMatchObject({ timeUtc: '2026-11-18T05:00:00Z', temperature: -1.5 });
  });

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
