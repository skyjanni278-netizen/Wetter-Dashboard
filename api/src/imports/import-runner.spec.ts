import type { DataSource } from 'typeorm';
import { insertImport, openTestDatabase } from '../../test/support/database';
import {
  fakeFetch,
  forecastDays,
  jsonResponse,
  openMeteoDailyBody,
  openMeteoHourlyBody,
  providerHours,
} from '../../test/support/fakes';
import { FixedClock } from '../common/clock';
import { DailyForecast } from '../forecasts/daily-forecast.entity';
import { TypeOrmForecastStore } from '../forecasts/typeorm-forecast.store';
import { Observation } from '../observations/observation.entity';
import { TypeOrmObservationStore } from '../observations/typeorm-observation.store';
import { OpenMeteoClient, OpenMeteoError } from '../weather-provider/open-meteo.client';
import { emptyCounts } from './import';
import type { ImportKind } from './import';
import { Import } from './import.entity';
import type { ImportStore } from './import.store';
import { ImportRunner } from './import-runner';
import { TypeOrmImportStore } from './typeorm-import.store';

/** Berliner 01.–03.10.2026 (MESZ) = UTC 30.09. 22:00 bis 03.10. 21:59; Open-Meteo liefert UTC 30.09.–03.10. */
const UTC_SEP30_TO_OCT3 = providerHours('2026-09-30T00:00:00Z', 96);

let dataSource: DataSource | undefined;
afterEach(async () => {
  await dataSource?.destroy();
  dataSource = undefined;
});

/**
 * Runner mit den Stores der App auf SQLite `:memory:` (seit 9b statt der In-Memory-Stores). Vorher vorhanden:
 * 01.10. mit denselben Werten wie die Antwort, 02.10. mit anderen (Temperatur −5), 03.10. fehlt.
 */
async function setup(provider: Pick<OpenMeteoClient, 'fetchHourly' | 'fetchDailyForecast'>) {
  const clock = new FixedClock('2026-11-20T10:00:00Z');
  dataSource = await openTestDatabase();
  const imports = new TypeOrmImportStore(dataSource.getRepository(Import));
  const observations = new TypeOrmObservationStore(dataSource.getRepository(Observation), clock);
  const forecasts = new TypeOrmForecastStore(dataSource.getRepository(DailyForecast));
  const existing = await insertImport(dataSource, { kind: 'legacy', from: '2026-10-01', to: '2026-10-02', at: '2026-11-19T12:00:00Z' });
  await observations.upsertHours(
    [
      ...UTC_SEP30_TO_OCT3.slice(22, 46),
      ...UTC_SEP30_TO_OCT3.slice(46, 70).map(h => ({ ...h, temperature: -5 })),
    ].map(h => ({ ...h, source: 'archive' as const })),
    { mode: 'upsert', importId: existing },
  );
  const runner = new ImportRunner(imports, observations, forecasts, provider as OpenMeteoClient, clock);
  return { clock, imports, observations, forecasts, runner };
}

async function queue(store: ImportStore, kind: ImportKind = 'range', from = '2026-10-01', to = '2026-10-03') {
  return store.create({
    locationId: 1,
    kind,
    from,
    to,
    overwriteCorrections: false,
    requestedBy: null,
    requestedAt: '2026-11-20T10:00:00Z',
    counts: emptyCounts(),
    warnings: [],
  });
}

describe('ImportRunner (US08-2, R32, F01)', () => {
  it('erfolgreich: 72 Stunden für drei Berliner Tage, Zähler gegen den Altbestand, Vorhersage gespeichert', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue(UTC_SEP30_TO_OCT3),
      fetchDailyForecast: jest.fn().mockResolvedValue(forecastDays('2026-11-20')),
    };
    const { imports, observations, forecasts, runner, clock } = await setup(provider);
    const record = await queue(imports);
    clock.advance(3_000);

    await runner.run(record.id);

    const done = await imports.findById(record.id);
    expect(done).toMatchObject({
      status: 'succeeded',
      startedAt: '2026-11-20T10:00:03Z',
      finishedAt: '2026-11-20T10:00:03Z',
      counts: { inserted: 24, updated: 24, unchanged: 24, skippedCorrected: 0 },
      warnings: [],
      error: null,
    });
    expect(provider.fetchHourly).toHaveBeenCalledWith(
      { source: 'archive', startDate: '2026-09-30', endDate: '2026-10-03' },
      expect.objectContaining({ latitude: 48.7936, longitude: 9.9369 }),
    );
    expect(await observations.getDay('2026-09-30')).toBeNull();
    expect(await observations.getDay('2026-10-04')).toBeNull();
    const oct3 = await observations.getDay('2026-10-03');
    expect(oct3).toHaveLength(24);
    expect(oct3?.[0]).toMatchObject({ timeLocal: '2026-10-03T00:00', timeUtc: '2026-10-02T22:00:00Z' });
    expect((await forecasts.getLatest())?.days).toHaveLength(7);
    expect((await forecasts.getLatest())?.importId).toBe(record.id);
  });

  it('US08-2: Fehler nur bei daily → partial mit Warnung, Stundenwerte gespeichert', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue(UTC_SEP30_TO_OCT3),
      fetchDailyForecast: jest
        .fn()
        .mockRejectedValue(new OpenMeteoError('UPSTREAM_TIMEOUT', 'Open-Meteo antwortete nicht innerhalb von 15 s')),
    };
    const { imports, observations, forecasts, runner } = await setup(provider);
    const record = await queue(imports);

    await runner.run(record.id);

    const done = await imports.findById(record.id);
    expect(done?.status).toBe('partial');
    expect(done?.error).toBeNull();
    expect(done?.counts).toEqual({ inserted: 24, updated: 24, unchanged: 24, skippedCorrected: 0 });
    expect(done?.warnings).toEqual([
      {
        code: 'FORECAST_FAILED',
        message: 'Tagesvorhersage nicht gespeichert (UPSTREAM_TIMEOUT): Open-Meteo antwortete nicht innerhalb von 15 s',
      },
    ]);
    expect(await observations.getDay('2026-10-03')).toHaveLength(24);
    expect((await observations.getDay('2026-10-02'))?.[0].temperature).not.toBe(-5);
    expect(await forecasts.getLatest()).toBeNull();
  });

  describe('R32 mit echtem Client und ungültiger Antwort: failed, UPSTREAM_INVALID, nichts geschrieben', () => {
    const valid = openMeteoHourlyBody(UTC_SEP30_TO_OCT3);
    const cases: [string, unknown][] = [
      ['{} (gültiges JSON ohne hourly)', {}],
      [
        'Arrays ungleich lang',
        { ...valid, hourly: { ...(valid['hourly'] as object), temperature_2m: [1, 2, 3] } },
      ],
      ['utc_offset_seconds ≠ 0', { ...valid, utc_offset_seconds: 3600 }],
      ['kein JSON', 'Bad Gateway'],
    ];

    it.each(cases)('%s', async (_name, body) => {
      const fetch = fakeFetch({
        hourly: () => jsonResponse(body),
        daily: () => jsonResponse(openMeteoDailyBody(forecastDays('2026-11-20'))),
      });
      const { imports, observations, forecasts, runner } = await setup(new OpenMeteoClient(fetch, []));
      const upsert = jest.spyOn(observations, 'upsertHours');
      const before = await observations.getDay('2026-10-02');
      const record = await queue(imports);

      await runner.run(record.id);

      const done = await imports.findById(record.id);
      expect(done?.status).toBe('failed');
      expect(done?.error?.code).toBe('UPSTREAM_INVALID');
      expect(done?.error?.message).not.toMatch(/at .*\.ts/);
      expect(done?.finishedAt).toBe('2026-11-20T10:00:00Z');
      expect(done?.counts).toEqual(emptyCounts());
      expect(upsert).not.toHaveBeenCalled();
      expect(await observations.getDay('2026-10-03')).toBeNull();
      expect(await observations.getDay('2026-10-02')).toEqual(before);
      expect(await forecasts.getLatest()).toBeNull();
    });
  });

  describe('R15 beim Import: unbekannter WMO-Code → null plus Warnung UNKNOWN_WMO_CODE', () => {
    // Index 0 = 30.09. 00:00 UTC (Berliner 30.09., nicht übernommen), 50 = 02.10. 02:00 UTC, 77–79 = 03.10. 05:00–07:00 UTC.
    const unknownCodes: Record<number, number> = { 0: 4, 50: 100, 77: 4, 78: -1, 79: 2.5 };
    const hoursWithUnknownCodes = providerHours('2026-09-30T00:00:00Z', 96, i =>
      i in unknownCodes ? { weatherCode: unknownCodes[i] } : {},
    );

    async function runWith(daily: () => Response) {
      const fetch = fakeFetch({ hourly: () => jsonResponse(openMeteoHourlyBody(hoursWithUnknownCodes)), daily });
      const context = await setup(new OpenMeteoClient(fetch, []));
      const record = await queue(context.imports);
      await context.runner.run(record.id);
      return { ...context, done: await context.imports.findById(record.id) };
    }

    it('Import bricht nicht ab: succeeded, Werte null, je übernommene Stunde eine Warnung mit timeUtc', async () => {
      const { done, observations } = await runWith(() => jsonResponse(openMeteoDailyBody(forecastDays('2026-11-20'))));

      expect(done).toMatchObject({
        status: 'succeeded',
        error: null,
        counts: { inserted: 24, updated: 24, unchanged: 24, skippedCorrected: 0 },
      });
      expect(done?.warnings).toEqual([
        { code: 'UNKNOWN_WMO_CODE', message: 'Wettercode 100 unbekannt, als null gespeichert', timeUtc: '2026-10-02T02:00:00Z' },
        { code: 'UNKNOWN_WMO_CODE', message: 'Wettercode 4 unbekannt, als null gespeichert', timeUtc: '2026-10-03T05:00:00Z' },
        { code: 'UNKNOWN_WMO_CODE', message: 'Wettercode -1 unbekannt, als null gespeichert', timeUtc: '2026-10-03T06:00:00Z' },
        { code: 'UNKNOWN_WMO_CODE', message: 'Wettercode 2.5 unbekannt, als null gespeichert', timeUtc: '2026-10-03T07:00:00Z' },
      ]);
      const stored = [...((await observations.getDay('2026-10-02')) ?? []), ...((await observations.getDay('2026-10-03')) ?? [])];
      const codeAt = (timeUtc: string) => stored.find(h => h.timeUtc === timeUtc)?.weatherCode;
      expect(codeAt('2026-10-02T02:00:00Z')).toBeNull();
      expect(codeAt('2026-10-03T05:00:00Z')).toBeNull();
      expect(codeAt('2026-10-03T06:00:00Z')).toBeNull();
      expect(codeAt('2026-10-03T07:00:00Z')).toBeNull();
      expect(codeAt('2026-10-03T08:00:00Z')).toBe(3);
      expect(stored).toHaveLength(48);
    });

    it('mit Fehler der Tagesvorhersage: partial, Warnung UNKNOWN_WMO_CODE vor FORECAST_FAILED', async () => {
      const { done } = await runWith(() => jsonResponse({}));

      expect(done?.status).toBe('partial');
      expect(done?.warnings.map(w => w.code)).toEqual([
        'UNKNOWN_WMO_CODE',
        'UNKNOWN_WMO_CODE',
        'UNKNOWN_WMO_CODE',
        'UNKNOWN_WMO_CODE',
        'FORECAST_FAILED',
      ]);
    });
  });

  describe('Tagesvorhersage mit echtem Client (timezone=Europe/Berlin)', () => {
    async function withDailyOffset(offset: number) {
      const fetch = fakeFetch({
        hourly: () => jsonResponse(openMeteoHourlyBody(UTC_SEP30_TO_OCT3)),
        daily: () => jsonResponse(openMeteoDailyBody(forecastDays('2026-11-20'), offset)),
      });
      return setup(new OpenMeteoClient(fetch, []));
    }

    it('daily mit utc_offset_seconds 0 → partial mit Warnung, Stunden gespeichert', async () => {
      const { imports, observations, forecasts, runner } = await withDailyOffset(0);
      const record = await queue(imports);

      await runner.run(record.id);

      const done = await imports.findById(record.id);
      expect(done?.status).toBe('partial');
      expect(done?.error).toBeNull();
      expect(done?.warnings).toHaveLength(1);
      expect(done?.warnings[0].code).toBe('FORECAST_FAILED');
      expect(done?.warnings[0].message).toContain('(UPSTREAM_INVALID)');
      expect(done?.warnings[0].message).toContain('utc_offset_seconds');
      expect(await observations.getDay('2026-10-03')).toHaveLength(24);
      expect(await forecasts.getLatest()).toBeNull();
    });

    it('daily mit utc_offset_seconds 3600 → succeeded, Vorhersage mit Berliner Daten gespeichert', async () => {
      const { imports, forecasts, runner } = await withDailyOffset(3600);
      const record = await queue(imports);

      await runner.run(record.id);

      expect((await imports.findById(record.id))?.status).toBe('succeeded');
      const latest = await forecasts.getLatest();
      expect(latest?.days.map(d => d.date)).toEqual([
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
        '2026-11-25',
        '2026-11-26',
      ]);
    });
  });

  it('kind "gaps" legt nur fehlende Stunden an und lässt vorhandene unverändert', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue(UTC_SEP30_TO_OCT3),
      fetchDailyForecast: jest.fn().mockResolvedValue(forecastDays('2026-11-20')),
    };
    const { imports, observations, runner } = await setup(provider);
    const record = await queue(imports, 'gaps');

    await runner.run(record.id);

    expect((await imports.findById(record.id))?.counts).toEqual({
      inserted: 24,
      updated: 0,
      unchanged: 48,
      skippedCorrected: 0,
    });
    expect((await observations.getDay('2026-10-02'))?.[0].temperature).toBe(-5);
  });

  it('teilt den Zeitraum in Archiv und Forecast-API (letzte 10 Tage)', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue([]),
      fetchDailyForecast: jest.fn().mockResolvedValue([]),
    };
    const { imports, runner } = await setup(provider);
    const record = await queue(imports, 'range', '2026-11-08', '2026-11-12');

    await runner.run(record.id);

    expect(provider.fetchHourly.mock.calls.map(call => call[0])).toEqual([
      { source: 'archive', startDate: '2026-11-07', endDate: '2026-11-09' },
      { source: 'forecast', startDate: '2026-11-09', endDate: '2026-11-12' },
    ]);
  });

  it('unerwarteter Fehler im Store → failed mit INTERNAL_ERROR, ohne Stacktrace', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue(UTC_SEP30_TO_OCT3),
      fetchDailyForecast: jest.fn().mockResolvedValue([]),
    };
    const { imports, observations, runner } = await setup(provider);
    jest.spyOn(observations, 'upsertHours').mockRejectedValue(new Error('kaputt'));
    const record = await queue(imports);

    await runner.run(record.id);

    expect((await imports.findById(record.id))?.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Unerwarteter Fehler beim Import',
    });
  });

  it('schedule startet erst nach setImmediate; whenIdle wartet auf das Ende', async () => {
    const provider = {
      fetchHourly: jest.fn().mockResolvedValue([]),
      fetchDailyForecast: jest.fn().mockResolvedValue([]),
    };
    const { imports, runner } = await setup(provider);
    const record = await queue(imports);

    runner.schedule(record.id);
    expect((await imports.findById(record.id))?.status).toBe('queued');
    await runner.whenIdle();
    expect((await imports.findById(record.id))?.status).toBe('succeeded');
  });
});
