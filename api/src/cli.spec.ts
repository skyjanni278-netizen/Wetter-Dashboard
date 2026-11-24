import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { legacyHours, tempDir, writeLegacyDay } from '../test/support/legacy-files';
import { main } from './cli';
import { dataSourceOptions } from './database/database-options';

/** Abrufzeitpunkt der Altdateien (03 Z2: Backfill 19.11.2026 14:36 MEZ). */
const BACKFILL = '2026-11-19T13:36:34Z';

/**
 * Exit-Codes und Bericht der CLI (US15-1, US15-4, B4.6) über `main(argv)`; Altdateien und Datenbankdatei liegen
 * in Temp-Ordnern. `test-env.ts` setzt `NODE_ENV=test` (keine `api/.env`) und `DB_PATH=:memory:`.
 */
describe('cli main(argv): Exit-Codes und Bericht (US15-1, US15-4)', () => {
  let dir: string;
  let output: string[];

  beforeEach(async () => {
    dir = await tempDir('wetter-cli-');
    output = [];
    const capture = (...args: unknown[]) => void output.push(args.join(' '));
    jest.spyOn(console, 'log').mockImplementation(capture);
    jest.spyOn(console, 'error').mockImplementation(capture);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.env['DB_PATH'] = ':memory:';
    await rm(dir, { recursive: true, force: true });
  });

  const text = () => output.join('\n');

  /** Zwei Monate; mit `seedFormat` fehlen in der Datei vom 02.10. u. a. `windspeed` und `apparentTemperature` (F16). */
  async function writeArchive(options: { seedFormat?: boolean } = {}): Promise<void> {
    await writeLegacyDay(dir, '2026-10-01', { modifiedAt: BACKFILL });
    await writeLegacyDay(dir, '2026-10-02', {
      modifiedAt: BACKFILL,
      hourly: options.seedFormat
        ? legacyHours('2026-10-02').map(h => ({ time: h.time, temperature: h.temperature, precipitation: 0, weathercode: 3 }))
        : undefined,
    });
    await writeLegacyDay(dir, '2026-11-01', { modifiedAt: BACKFILL });
  }

  /** Migrierte Datenbankdatei im Temp-Ordner (wie nach `npm run migration:run`). */
  async function migratedDatabase(): Promise<string> {
    const file = path.join(dir, 'weather.test.db');
    const dataSource = new DataSource(dataSourceOptions(file));
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'each' });
    await dataSource.destroy();
    return file;
  }

  async function query<T>(file: string, sql: string): Promise<T[]> {
    const dataSource = new DataSource({ ...dataSourceOptions(file), migrationsRun: false });
    await dataSource.initialize();
    try {
      return (await dataSource.query(sql)) as T[];
    } finally {
      await dataSource.destroy();
    }
  }

  it('US15-1: import:legacy --dry-run mit gültigen Dateien → 0, „3 Dateien gültig, 0 Fehler“, nichts geschrieben', async () => {
    await writeArchive();
    const before = await readdir(dir, { recursive: true });

    const code = await main(['import:legacy', '--dir', dir, '--dry-run']);

    expect(code).toBe(0);
    expect(text()).toContain('(Probelauf, nichts geschrieben)');
    expect(text()).toContain('3 Dateien gültig, 0 Fehler');
    expect(text()).not.toContain('ungültig:');
    expect(text()).not.toContain('Datenbank:');
    expect(await readdir(dir, { recursive: true })).toEqual(before);
  });

  it('US15-4: --dry-run mit einer Datei im Seed-Format → 1, die Datei steht im Bericht', async () => {
    await writeArchive({ seedFormat: true });

    const code = await main(['import:legacy', '--dir', dir, '--dry-run']);

    expect(code).toBe(1);
    expect(text()).toContain('2 Dateien gültig, 1 Fehler');
    expect(text()).toMatch(/ungültig: 2026-10\/2026-10-02\.json: .*windspeed/);
  });

  it('US15-4: echter Lauf mit Datei im Seed-Format → 1, partial, Oktober nicht geschrieben, November schon', async () => {
    await writeArchive({ seedFormat: true });
    const file = await migratedDatabase();
    process.env['DB_PATH'] = file;

    const code = await main(['import:legacy', '--dir', dir]);

    expect(code).toBe(1);
    expect(text()).toContain(`Datenbank: ${file}`);
    expect(text()).toContain('ungültig: 2026-10/2026-10-02.json');
    expect(text()).toContain('Nicht geschrieben: 2026-10');
    expect(text()).toMatch(/Import 1 \(kind = legacy\): partial; inserted = 24/);
    const days = await query<{ local_date: string; n: number }>(
      file,
      'SELECT "local_date", COUNT(*) AS "n" FROM "observation" GROUP BY "local_date" ORDER BY "local_date"',
    );
    expect(days).toEqual([{ local_date: '2026-11-01', n: 24 }]);
  });

  it('echter Lauf mit gültigen Dateien → 0, succeeded', async () => {
    await writeArchive();
    process.env['DB_PATH'] = await migratedDatabase();

    expect(await main(['import:legacy', '--dir', dir])).toBe(0);
    expect(text()).toMatch(/Import 1 \(kind = legacy\): succeeded; inserted = 72/);
  });

  it.each([
    ['ohne Befehl', []],
    ['unbekannter Befehl', ['import:alles']],
    ['import:legacy ohne --dir', ['import:legacy', '--dry-run']],
    ['unbekanntes Argument', ['import:legacy', '--dir', '.', '--force']],
    ['--dry-run bei legacy:dst-check', ['legacy:dst-check', '--dir', '.', '--dry-run']],
    ['admin:create ohne --username', ['admin:create']],
  ])('falscher Aufruf (%s) → 2 mit Aufrufhinweis', async (_name, argv) => {
    expect(await main(argv)).toBe(2);
    expect(text()).toContain('Aufruf: cli import:legacy --dir <pfad> [--dry-run]');
  });

  it('Ordner gibt es nicht → 1 mit „Fehler: …“', async () => {
    expect(await main(['import:legacy', '--dir', path.join(dir, 'fehlt'), '--dry-run'])).toBe(1);
    expect(text()).toMatch(/^Fehler: Ordner .*fehlt gibt es nicht\.$/m);
  });
});
