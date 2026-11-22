import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import {
  legacyForecastDays,
  legacyHours,
  tempDir,
  writeLegacyDay,
  writeLegacyForecast,
} from '../../test/support/legacy-files';
import { FixedClock } from '../common/clock';
import { DailyForecast } from '../forecasts/daily-forecast.entity';
import { TypeOrmForecastStore } from '../forecasts/typeorm-forecast.store';
import { Import } from '../imports/import.entity';
import { TypeOrmImportStore } from '../imports/typeorm-import.store';
import { Observation } from '../observations/observation.entity';
import { TypeOrmObservationStore } from '../observations/typeorm-observation.store';
import { checkLegacyArchive, LEGACY_ARCHIVE_UNTIL, LegacyImporter, legacySourceOf } from './legacy-import';

/** Abrufzeitpunkte wie im Altbestand (03 Z2): Backfill 19.11.2026 14:36 MEZ, Scheduler 19.11. 22:04 MEZ. */
const BACKFILL = '2026-11-19T13:36:34Z';
const SCHEDULER = '2026-11-19T21:04:32Z';

describe('LegacyImporter (US15, 03 B2.7 Schritte 4–9)', () => {
  let dir: string;
  let dataSource: DataSource;
  let importer: LegacyImporter;
  const clock = new FixedClock('2026-11-22T12:00:00Z');

  const rows = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);
  const count = async (where = '1 = 1', params: unknown[] = []) =>
    Number((await rows(`SELECT COUNT(*) AS n FROM "observation" WHERE ${where}`, params))[0].n);

  beforeEach(async () => {
    clock.set('2026-11-22T12:00:00Z');
    dir = await tempDir('wetter-legacy-import-');
    dataSource = await openTestDatabase();
    importer = new LegacyImporter({
      imports: new TypeOrmImportStore(dataSource.getRepository(Import)),
      observations: new TypeOrmObservationStore(dataSource.getRepository(Observation), clock),
      forecasts: new TypeOrmForecastStore(dataSource.getRepository(DailyForecast)),
      clock,
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  /** November 2026 wie im Altbestand: Archiv bis 08.11., Forecast-API danach, Teiltag 19.11. */
  async function writeNovember(): Promise<void> {
    await writeLegacyDay(dir, '2026-11-08', { modifiedAt: BACKFILL });
    await writeLegacyDay(dir, '2026-11-09', { modifiedAt: BACKFILL });
    await writeLegacyDay(dir, '2026-11-19', { modifiedAt: SCHEDULER });
  }

  it('Herkunft nach Z2: bis 08.11.2026 archive, danach forecast_api', () => {
    expect(LEGACY_ARCHIVE_UNTIL).toBe('2026-11-08');
    expect(legacySourceOf('2026-11-08')).toBe('archive');
    expect(legacySourceOf('2026-11-09')).toBe('forecast_api');
  });

  it('US15-1: Probelauf prüft alles, schreibt nichts (kein Import-Eintrag), Quelle unverändert', async () => {
    await writeNovember();
    const file = path.join(dir, '2026-11', '2026-11-19.json');
    const before = { content: await readFile(file, 'utf-8'), mtime: (await stat(file)).mtimeMs };

    const report = await importer.run({ dir, dryRun: true });

    expect(report).toMatchObject({ dryRun: true, files: { total: 3, valid: 3, invalid: 0 }, hours: 72, counts: null, importId: null });
    expect(report.bySource).toEqual({
      archive: { days: 1, hours: 24 },
      forecast_api: { days: 2, hours: 47 },
      prediction: { days: 1, hours: 1 },
    });
    expect(await count()).toBe(0);
    expect(await rows('SELECT * FROM "import"')).toEqual([]);
    expect(await checkLegacyArchive(dir)).toEqual(report);
    expect(await readFile(file, 'utf-8')).toBe(before.content);
    expect((await stat(file)).mtimeMs).toBe(before.mtime);
    expect((await readdir(dir)).sort()).toEqual(['2026-11']);
  });

  it('US15-2/-3: echter Lauf schreibt alle Stunden mit kind = legacy; zweiter Lauf: alle unchanged', async () => {
    await writeNovember();
    await writeLegacyForecast(dir, legacyForecastDays(19), SCHEDULER);

    const first = await importer.run({ dir, dryRun: false });
    expect(first).toMatchObject({
      status: 'succeeded',
      importId: 1,
      counts: { inserted: 72, updated: 0, unchanged: 0, skippedCorrected: 0 },
      writtenMonths: ['2026-11'],
      skippedMonths: [],
      forecastDays: 7,
    });
    const [record] = await rows('SELECT * FROM "import"');
    expect(record).toMatchObject({
      kind: 'legacy',
      status: 'succeeded',
      from_date: '2026-11-08',
      to_date: '2026-11-19',
      count_inserted: 72,
      requested_at: '2026-11-22T12:00:00Z',
      finished_at: '2026-11-22T12:00:00Z',
    });
    const warnings = JSON.parse(record.warnings_json) as { code: string; message: string }[];
    expect(warnings.map(w => w.code)).toEqual(['LEGACY_TIME_RULE', 'LEGACY_SOURCES']);
    expect(warnings[0].message).toContain('fixed+01:00');
    expect(warnings[1].message).toContain('archive 1 Tage / 24 Stunden, forecast_api 2 Tage / 47 Stunden, prediction 1 Tage / 1 Stunden');

    clock.set('2026-11-23T08:00:00Z');
    const second = await importer.run({ dir, dryRun: false });
    expect(second).toMatchObject({ status: 'succeeded', importId: 2, counts: { inserted: 0, updated: 0, unchanged: 72, skippedCorrected: 0 } });
    expect(await count()).toBe(72);
  });

  it('Z2/R08: fetched_at = Änderungszeit; Stunden danach sind Vorhersage, im Winter Ortszeit = UTC + 1 h', async () => {
    await writeNovember();
    await importer.run({ dir, dryRun: false });

    const hour = async (timeUtc: string) =>
      (await rows('SELECT "source", "fetched_at", "local_date", "local_hour", "updated_at" FROM "observation" WHERE "time_utc" = ?', [timeUtc]))[0];
    expect(await hour('2026-11-08T22:00:00Z')).toMatchObject({ source: 'archive', fetched_at: BACKFILL, local_date: '2026-11-08', local_hour: 23 });
    expect(await hour('2026-11-08T23:00:00Z')).toMatchObject({ source: 'forecast_api', local_date: '2026-11-09', local_hour: 0 });
    // 19.11.: Datei um 22:04 MEZ geschrieben → 22:00 MEZ (21:00Z) gemessen, 23:00 MEZ Vorhersage.
    expect(await hour('2026-11-19T21:00:00Z')).toMatchObject({ source: 'forecast_api', fetched_at: SCHEDULER });
    expect(await hour('2026-11-19T22:00:00Z')).toMatchObject({ source: 'prediction', fetched_at: SCHEDULER, updated_at: '2026-11-22T12:00:00Z' });
  });

  it('B2.7 Schritt 5: DST-Tage haben nach der Umrechnung 23 bzw. 25 Stunden, ohne Warnung', async () => {
    for (const date of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
      await writeLegacyDay(dir, date, { modifiedAt: BACKFILL });
    }
    const report = await importer.run({ dir, dryRun: false });

    const perDay = await rows('SELECT "local_date" AS d, COUNT(*) AS n FROM "observation" GROUP BY "local_date" ORDER BY 1');
    expect(Object.fromEntries(perDay.map((r: { d: string; n: number }) => [r.d, r.n]))).toMatchObject({
      '2026-03-29': 23,
      '2026-03-30': 24,
      '2026-10-25': 25,
      '2026-10-26': 24,
    });
    // Randtage ohne Nachbardatei: 28.03. vollständig (Winter), 31.03. mit nur 00:00, 24.10. ohne 00:00, 27.10. fehlt.
    expect(report.warnings.filter(w => w.code === 'LEGACY_HOURS_PER_DAY').map(w => w.message)).toEqual([
      '2026-03-31: 1 Stunden nach der Umrechnung, erwartet 24',
      '2026-10-24: 23 Stunden nach der Umrechnung, erwartet 24',
    ]);
    // 25.10.: zwei Stunden 02:00 (MESZ und MEZ).
    const twoAm = await rows(`SELECT "utc_offset_min" AS o FROM "observation" WHERE "local_date" = '2026-10-25' AND "local_hour" = 2 ORDER BY "time_utc"`);
    expect(twoAm.map((r: { o: number }) => r.o)).toEqual([120, 60]);
  });

  it('US15-4: Datei im Seed-Format → Monat nicht geschrieben, übrige Monate schon, Status partial', async () => {
    await writeLegacyDay(dir, '2026-10-01', { modifiedAt: BACKFILL });
    await writeLegacyDay(dir, '2026-10-02', {
      modifiedAt: BACKFILL,
      hourly: legacyHours('2026-10-02').map(h => ({ time: h.time, temperature: h.temperature, precipitation: 0, weathercode: 3 })),
    });
    await writeLegacyDay(dir, '2026-11-01', { modifiedAt: BACKFILL });

    const report = await importer.run({ dir, dryRun: false });

    expect(report).toMatchObject({
      status: 'partial',
      files: { total: 3, valid: 2, invalid: 1 },
      skippedMonths: ['2026-10'],
      writtenMonths: ['2026-11'],
      counts: { inserted: 24 },
    });
    expect(report.invalidFiles).toEqual([{ file: '2026-10/2026-10-02.json', message: expect.stringContaining('apparentTemperature') }]);
    expect(report.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['LEGACY_INVALID_FILE', 'LEGACY_MONTH_SKIPPED']));
    expect(await count(`"local_date" LIKE '2026-10-%'`)).toBe(0);
    expect(await count(`"local_date" = '2026-11-01'`)).toBe(24);
    expect((await rows('SELECT "status" FROM "import"'))[0].status).toBe('partial');
  });

  it('alle Monate ungültig → failed mit LEGACY_INVALID, nichts geschrieben; Probelauf meldet den Fehler', async () => {
    await writeLegacyDay(dir, '2026-10-01', { content: { date: '2026-10-02', location: 'Heubach', hourly: legacyHours('2026-10-02') } });

    expect((await checkLegacyArchive(dir)).invalidFiles).toEqual([
      { file: '2026-10/2026-10-01.json', message: 'date "2026-10-02" passt nicht zum Dateinamen' },
    ]);
    const report = await importer.run({ dir, dryRun: false });
    expect(report).toMatchObject({ status: 'failed', error: { code: 'LEGACY_INVALID' }, counts: { inserted: 0 } });
    expect(await count()).toBe(0);
  });

  it('B2.7 Schritt 7: unbekannter Wettercode → null plus Warnung mit timeUtc', async () => {
    await writeLegacyDay(dir, '2026-11-01', { modifiedAt: BACKFILL, hourly: legacyHours('2026-11-01', h => (h === 5 ? { weatherCode: 42 } : {})) });

    const report = await importer.run({ dir, dryRun: false });

    expect(report.status).toBe('succeeded');
    expect(report.warnings.find(w => w.code === 'LEGACY_UNKNOWN_WEATHER_CODE')).toEqual({
      code: 'LEGACY_UNKNOWN_WEATHER_CODE',
      message: '2026-11/2026-11-01.json 2026-11-01T05:00: Wettercode 42 unbekannt, als null übernommen',
      timeUtc: '2026-11-01T04:00:00Z',
    });
    expect((await rows(`SELECT "weather_code" AS w FROM "observation" WHERE "time_utc" = '2026-11-01T04:00:00Z'`))[0].w).toBeNull();
  });

  it('forecast.json → daily_forecast mit fetched_at = Änderungszeit; fehlt sie, nur ein Hinweis', async () => {
    await writeLegacyDay(dir, '2026-11-01', { modifiedAt: BACKFILL });
    const withoutForecast = await importer.run({ dir, dryRun: false });
    expect(withoutForecast.status).toBe('succeeded');
    expect(withoutForecast.warnings.map(w => w.code)).toContain('LEGACY_NO_FORECAST');

    await writeLegacyForecast(dir, legacyForecastDays(19), SCHEDULER);
    await importer.run({ dir, dryRun: false });
    const forecast = await new TypeOrmForecastStore(dataSource.getRepository(DailyForecast)).getLatest();
    expect(forecast).toMatchObject({ fetchedAt: SCHEDULER, importId: 2 });
    expect(forecast?.days).toHaveLength(7);
  });

  it('ohne Tagesdateien → Fehler, kein Import-Eintrag', async () => {
    await expect(importer.run({ dir, dryRun: false })).rejects.toThrow(/Keine Tagesdateien/);
    expect(await rows('SELECT * FROM "import"')).toEqual([]);
  });
});
