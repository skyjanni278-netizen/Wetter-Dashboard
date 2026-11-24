import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { DB_PATH } from '../src/database/db-path';
import { ImportRunner } from '../src/imports/import-runner';
import { SCHEDULER_ENABLED } from '../src/scheduler/scheduler-enabled';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import type { HourlyRequest, ProviderHour } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { adminToken, authHeader } from './support/auth';
import { insertImport, openTestDatabase, storedRow } from './support/database';
import { forecastDays, providerHours } from './support/fakes';

/**
 * Schritt 9a: Die App arbeitet auf SQLite (TypeORM-Stores). Kein Netz: `OpenMeteoClient` ist gemockt.
 * Standard ist `:memory:` (test/support/test-env.ts); Neustart-Tests nutzen eine Datei im Temp-Ordner.
 */

/** Ändert oder entfernt (`null`) einzelne Stunden der Provider-Antwort. */
type Mutator = (hour: ProviderHour) => ProviderHour | null;

function fakeProvider() {
  let mutate: Mutator = hour => hour;
  const provider = {
    fetchHourly: jest.fn(async (req: HourlyRequest) => {
      const days = (Date.parse(`${req.endDate}T00:00:00Z`) - Date.parse(`${req.startDate}T00:00:00Z`)) / 86_400_000 + 1;
      return providerHours(`${req.startDate}T00:00:00Z`, days * 24, () => ({ temperature: 5 }))
        .map(h => mutate(h))
        .filter((h): h is ProviderHour => h !== null);
    }),
    fetchDailyForecast: jest.fn(async () => forecastDays('2026-11-20')),
  };
  return { provider, setMutator: (m: Mutator) => (mutate = m) };
}

interface Harness {
  app: INestApplication<App>;
  dataSource: DataSource;
  /** Startet einen Import über HTTP und wartet, bis er fertig ist. */
  runImport(kind: 'range' | 'gaps', from: string, to: string): Promise<Record<string, any>>;
  get(url: string): request.Test;
  /** GET mit Admin-Token (geschützte Endpunkte `/api/imports`, `/api/gaps`, Schritt 10). */
  adminGet(url: string): request.Test;
}

async function start(clock: FixedClock, provider: object, dbPath?: string): Promise<Harness> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(OpenMeteoClient)
    .useValue(provider);
  if (dbPath) builder = builder.overrideProvider(DB_PATH).useValue(dbPath);
  const app = await createTestApp(await builder.compile());
  const runner = app.get(ImportRunner);
  const get = (url: string) => request(app.getHttpServer()).get(url);
  const auth = authHeader(await adminToken(app));
  const adminGet = (url: string) => get(url).set(auth);
  return {
    app,
    dataSource: app.get(DataSource),
    get,
    adminGet,
    async runImport(kind, from, to) {
      const created = await request(app.getHttpServer()).post('/api/imports').set(auth).send({ kind, from, to }).expect(202);
      await runner.whenIdle();
      return (await adminGet(`/api/imports/${created.body.id}`).expect(200)).body;
    },
  };
}

describe('Datenbank: PRAGMA, Fremdschlüssel, CHECK (B2.6), Health (US14-3), Cache-Control (B4.5)', () => {
  let h: Harness;
  const clock = new FixedClock('2026-11-20T10:00:00Z');

  beforeAll(async () => {
    h = await start(clock, fakeProvider().provider);
  });
  afterAll(() => h.app.close());

  it('PRAGMA foreign_keys = 1 in der App, busy_timeout = 5000; Stammdatum Heubach ist da', async () => {
    expect(await h.dataSource.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    expect(await h.dataSource.query('PRAGMA busy_timeout')).toEqual([{ timeout: 5000 }]);
    expect(await h.dataSource.query('SELECT "id", "slug" FROM "location"')).toEqual([{ id: 1, slug: 'heubach' }]);
  });

  const insert = (locationId: number, importId: number, temperature: number) =>
    h.dataSource.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature", "source", "import_id", "fetched_at", "updated_at")
       VALUES (?, '2026-11-10T11:00:00Z', '2026-11-10', 12, 60, ?, 'archive', ?, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z')`,
      [locationId, temperature, importId],
    );

  it('Observation mit location_id = 99 → FK-Fehler; temperature = 51 → CHECK-Fehler', async () => {
    const importId = await insertImport(h.dataSource);
    await expect(insert(99, importId, 7)).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(insert(1, importId, 51)).rejects.toThrow(/CHECK constraint failed: CHK_observation_temperature/);
    await expect(insert(1, 999, 7)).rejects.toThrow(/FOREIGN KEY constraint failed/);
    const [row]: { n: number }[] = await h.dataSource.query('SELECT COUNT(*) AS "n" FROM "observation"');
    expect(row.n).toBe(0);
  });

  /** Eine gültige Stunde, in der eine Spalte durch `value` ersetzt ist. */
  const insertWith = (importId: number, column: string, value: number, timeUtc = '2026-11-10T11:00:00Z') => {
    const values: Record<string, number> = {
      utc_offset_min: 60,
      temperature: 7,
      apparent_temperature: 5,
      precipitation: 0,
      weather_code: 3,
      wind_speed: 12,
      wind_direction: 220,
      [column]: value,
    };
    const columns = Object.keys(values);
    return h.dataSource.query(
      `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", ${columns.map(c => `"${c}"`).join(', ')}, "source", "import_id", "fetched_at", "updated_at")
       VALUES (1, ?, '2026-11-10', 12, ${columns.map(() => '?').join(', ')}, 'archive', ?, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z')`,
      [timeUtc, ...columns.map(c => values[c]), importId],
    );
  };

  it.each([
    ['R15', 'weather_code', 4, 'CHK_observation_weather_code'],
    ['R16', 'apparent_temperature', 60.1, 'CHK_observation_apparent_temperature'],
    ['R16', 'precipitation', -0.1, 'CHK_observation_precipitation'],
    ['R16', 'wind_speed', 300.1, 'CHK_observation_wind_speed'],
    ['R16', 'wind_direction', 361, 'CHK_observation_wind_direction'],
    ['R07', 'utc_offset_min', 0, 'CHK_observation_utc_offset'],
  ])('%s: %s = %d → CHECK-Fehler %s', async (_rule, column, value, constraint) => {
    const importId = await insertImport(h.dataSource);
    await expect(insertWith(importId, column, value)).rejects.toThrow(`CHECK constraint failed: ${constraint}`);
    const [row]: { n: number }[] = await h.dataSource.query('SELECT COUNT(*) AS "n" FROM "observation"');
    expect(row.n).toBe(0);
  });

  it('R07: dieselbe UTC-Stunde doppelt (location_id, time_utc) → UNIQUE-Fehler', async () => {
    const importId = await insertImport(h.dataSource);
    const timeUtc = '2026-10-25T01:00:00Z';
    try {
      await insertWith(importId, 'utc_offset_min', 60, timeUtc);
      await expect(insertWith(importId, 'utc_offset_min', 120, timeUtc)).rejects.toThrow(
        /UNIQUE constraint failed: observation\.location_id, observation\.time_utc/,
      );
      const rows: unknown[] = await h.dataSource.query('SELECT "id" FROM "observation" WHERE "time_utc" = ?', [timeUtc]);
      expect(rows).toHaveLength(1);
    } finally {
      await h.dataSource.query('DELETE FROM "observation" WHERE "time_utc" = ?', [timeUtc]);
    }
  });

  it('US14-3: GET /api/health → 200 { status: "ok", database: "ok" }', async () => {
    const res = await h.get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('B4.5: no-cache plus ETag (304 bei If-None-Match); /api/forecasts und /api/status max-age=60', async () => {
    const first = await h.get('/api/records').expect(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.headers['etag']).toMatch(/^W\//);
    await h.get('/api/records').set('If-None-Match', first.headers['etag']).expect(304);
    expect((await h.get('/api/status').expect(200)).headers['cache-control']).toBe('max-age=60');
    expect((await h.get('/api/forecasts').expect(200)).headers['cache-control']).toBe('max-age=60');
  });
});

describe('B2.4: range-Import ändert einen Wert → sofort sichtbar in /api/records und /api/summaries (Cache nach Datenrevision)', () => {
  let h: Harness;
  const clock = new FixedClock('2026-11-20T10:00:00Z');
  const { provider, setMutator } = fakeProvider();

  beforeAll(async () => {
    h = await start(clock, provider);
  });
  afterAll(() => h.app.close());

  it('neuer Wert ohne Neustart, version + 1, updated_at neu', async () => {
    expect((await h.runImport('range', '2026-11-10', '2026-11-11')).status).toBe('succeeded');
    const before = await h.get('/api/records').expect(200);
    expect(before.body.hottest).toMatchObject({ value: 5, date: '2026-11-10' });
    expect((await h.get('/api/summaries/years/2026').expect(200)).body.temperature.max).toBe(5);
    expect(await storedRow(h.dataSource, '2026-11-10T11:00:00Z')).toMatchObject({ version: 1, updated_at: '2026-11-20T10:00:00Z' });

    setMutator(hour => (hour.timeUtc === '2026-11-10T11:00:00Z' ? { ...hour, temperature: 25.4 } : hour));
    clock.advance(60 * 60 * 1000);
    const second = await h.runImport('range', '2026-11-10', '2026-11-11');
    expect(second.counts).toEqual({ inserted: 0, updated: 1, unchanged: 47, skippedCorrected: 0 });

    const after = await h.get('/api/records').expect(200);
    expect(after.body.hottest).toMatchObject({ value: 25.4, timeLocal: '2026-11-10T12:00', date: '2026-11-10' });
    expect(after.headers['etag']).not.toBe(before.headers['etag']);
    expect((await h.get('/api/summaries/years/2026').expect(200)).body.temperature.max).toBe(25.4);
    expect((await h.get('/api/summaries/years').expect(200)).body.items).toEqual([
      { id: '2026', year: 2026, complete: false, daysComplete: 2 },
    ]);
    expect(await storedRow(h.dataSource, '2026-11-10T11:00:00Z')).toMatchObject({
      temperature: 25.4,
      version: 2,
      updated_at: '2026-11-20T11:00:00Z',
      import_id: second.id,
    });
  });
});

describe('F32, R19: Importe überleben einen Neustart (Datei-DB im Temp-Ordner); Health 503', () => {
  let dir: string;
  let dbPath: string;
  const clock = new FixedClock('2026-11-20T10:00:00Z');

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wetter-db-e2e-'));
    dbPath = path.join(dir, 'weather.e2e.db');
    // Wie `npm run migration:run`: erst das Schema, dann startet die App (migrationsRun: false für Dateien).
    await (await openTestDatabase(dbPath)).destroy();
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('Neustart: GET /api/imports/1 → 200, Status erhalten; hängengebliebener Lauf → failed INTERRUPTED; Daten bleiben', async () => {
    const first = await start(clock, fakeProvider().provider, dbPath);
    const done = await first.runImport('range', '2026-11-10', '2026-11-10');
    expect(done).toMatchObject({ id: 1, status: 'succeeded', counts: { inserted: 24 } });
    // Ein zweiter Lauf, der beim Beenden noch „läuft“ (z. B. Absturz mitten im Import).
    const running = await insertImport(first.dataSource, { status: 'running', at: '2026-11-20T10:30:00Z' });
    await first.app.close();

    clock.set('2026-11-20T11:00:00Z');
    const second = await start(clock, fakeProvider().provider, dbPath);
    try {
      const again = await second.adminGet('/api/imports/1').expect(200);
      expect(again.body).toEqual(done);
      const interrupted = await second.adminGet(`/api/imports/${running}`).expect(200);
      expect(interrupted.body).toMatchObject({
        status: 'failed',
        finishedAt: '2026-11-20T11:00:00Z',
        error: { code: 'INTERRUPTED' },
      });
      expect((await second.get('/api/days/2026-11-10').expect(200)).body.hoursObserved).toBe(24);
      expect((await second.get('/api/status').expect(200)).body).toMatchObject({
        dataFrom: '2026-11-10',
        lastSuccessfulUpdateAt: done.finishedAt,
      });
      // Nach dem Neustart ist R19 frei: ein neuer Import bekommt die nächste ID.
      expect((await second.runImport('gaps', '2026-11-10', '2026-11-10')).id).toBe(running + 1);

      // US14-3: Datenbank nicht lesbar (Verbindung weg) → 503 im Fehlerformat B3.3.
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await second.dataSource.destroy();
      const res = await second.get('/api/health').expect(503);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Datenbank nicht lesbar'));
      log.mockRestore();
      expect(res.body).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE', details: { database: 'error' } });
    } finally {
      await second.app.close();
    }
  });
});

describe('US08-3 (Z3): Der Mitternachtslauf macht die 23-Uhr-Stunde von gestern zum Messwert', () => {
  let app: INestApplication<App>;
  const clock = new FixedClock('2026-11-19T21:05:00Z'); // 19.11. 22:05 MEZ
  const { provider, setMutator } = fakeProvider();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(OpenMeteoClient)
      .useValue(provider)
      .overrideProvider(SCHEDULER_ENABLED)
      .useValue(true)
      .compile();
    app = await createTestApp(moduleRef);
  });
  afterAll(() => app.close());

  /** Ein Scheduler-Lauf wie per Cron, bis der Import fertig ist. */
  async function tick() {
    const record = await app.get(SchedulerService).tick();
    await app.get(ImportRunner).whenIdle();
    return record;
  }

  it('Lauf 22:05 MEZ: 23:00 ist prediction; Lauf 20.11. 00:05 MEZ: hours[23] source = "forecast_api", isPrediction = false', async () => {
    expect(await tick()).toMatchObject({ kind: 'scheduled', from: '2026-11-18', to: '2026-11-19' });
    const before = await request(app.getHttpServer()).get('/api/days/2026-11-19').expect(200);
    expect(before.body.hours).toHaveLength(24);
    expect(before.body.hours[22]).toMatchObject({ timeLocal: '2026-11-19T22:00', source: 'forecast_api', isPrediction: false });
    expect(before.body.hours[23]).toMatchObject({ timeLocal: '2026-11-19T23:00', source: 'prediction', isPrediction: true, temperature: 5 });

    clock.set('2026-11-19T23:05:00Z'); // 20.11. 00:05 MEZ
    setMutator(hour => (hour.timeUtc === '2026-11-19T22:00:00Z' ? { ...hour, temperature: 3.7 } : hour));
    const midnight = await tick();
    expect(midnight).toMatchObject({ kind: 'scheduled', from: '2026-11-19', to: '2026-11-20' });

    const after = await request(app.getHttpServer()).get('/api/days/2026-11-19').expect(200);
    expect(after.body.hours[23]).toMatchObject({
      timeLocal: '2026-11-19T23:00',
      source: 'forecast_api',
      isPrediction: false,
      temperature: 3.7,
    });
    expect(after.body.hours.filter((hour: { source: string }) => hour.source === 'prediction')).toEqual([]);
    expect(provider.fetchHourly).toHaveBeenLastCalledWith(
      { source: 'forecast', startDate: '2026-11-18', endDate: '2026-11-20' },
      expect.anything(),
    );
  });
});

describe('US12: GET /api/gaps (gemockter Provider)', () => {
  let h: Harness;
  const clock = new FixedClock('2026-11-15T10:30:00Z');
  const { provider, setMutator } = fakeProvider();

  beforeAll(async () => {
    h = await start(clock, provider);
    // 15.11. um 11:30 MEZ abgerufen, danach keiner mehr: 12:00–23:00 Uhr sind bis heute nur Vorhersage.
    await h.runImport('range', '2026-11-15', '2026-11-15');
    clock.set('2026-11-19T13:30:00Z'); // jetzt 14:30 MEZ
    // 12.11. 04:00–06:00 MEZ fehlen, 14.11. 10:00 MEZ ohne Temperatur.
    setMutator(hour =>
      ['2026-11-12T03:00:00Z', '2026-11-12T04:00:00Z', '2026-11-12T05:00:00Z'].includes(hour.timeUtc)
        ? null
        : hour.timeUtc === '2026-11-14T09:00:00Z'
          ? { ...hour, temperature: null }
          : hour,
    );
    await h.runImport('range', '2026-11-01', '2026-11-14');
    await h.runImport('range', '2026-11-16', '2026-11-19');
    setMutator(hour => hour);
  });
  afterAll(() => h.app.close());

  it('US12-1: 200 mit Lücken missing / null_values / stale_prediction', async () => {
    const res = await h.adminGet('/api/gaps?from=2026-11-01&to=2026-11-19').expect(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body.items).toEqual([
      { id: '2026-11-12T03:00:00Z', from: '2026-11-12T04:00:00+01:00', to: '2026-11-12T06:00:00+01:00', hours: 3, reason: 'missing' },
      { id: '2026-11-14T09:00:00Z', from: '2026-11-14T10:00:00+01:00', to: '2026-11-14T10:00:00+01:00', hours: 1, reason: 'null_values' },
      { id: '2026-11-15T11:00:00Z', from: '2026-11-15T12:00:00+01:00', to: '2026-11-15T23:00:00+01:00', hours: 12, reason: 'stale_prediction' },
    ]);
  });

  it('US12-2: from > to → 400 VALIDATION_FAILED, errors[0] = { field: "to", code: "to_before_from" }', async () => {
    const res = await h.adminGet('/api/gaps?from=2026-11-19&to=2026-11-01').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'to', code: 'to_before_from' }] });
    expect((await h.adminGet('/api/gaps?from=2026-11-19&to=2026-11-20').expect(400)).body.code).toBe('DATE_IN_FUTURE');
    expect((await h.adminGet('/api/gaps?from=2026-11-19&to=2026-11-19&sort=asc').expect(400)).body.errors[0]).toMatchObject({
      field: 'sort',
      code: 'unrecognized_keys',
    });
  });

  it('US12-3: gaps-Import mit allen Stunden → succeeded, danach items = []', async () => {
    const result = await h.runImport('gaps', '2026-11-01', '2026-11-19');
    expect(result.status).toBe('succeeded');
    expect(result.counts).toMatchObject({ inserted: 3, updated: 13 });
    expect((await h.adminGet('/api/gaps?from=2026-11-01&to=2026-11-19').expect(200)).body).toEqual({ items: [] });
  });
});
