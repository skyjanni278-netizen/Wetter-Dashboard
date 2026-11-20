import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { ImportRunner } from '../src/imports/import-runner';
import { LEGACY_DATA_DIR } from '../src/legacy/legacy-data-dir';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import type { HourlyRequest, ProviderHour } from '../src/weather-provider/open-meteo.client';
import { forecastDays, legacyDay, providerHours } from './support/fakes';

/** Stunden für die angefragten UTC-Tage, wie Open-Meteo sie mit `timezone=GMT` liefert. */
function hoursFor(req: HourlyRequest): ProviderHour[] {
  const days = (Date.parse(`${req.endDate}T00:00:00Z`) - Date.parse(`${req.startDate}T00:00:00Z`)) / 86_400_000 + 1;
  return providerHours(`${req.startDate}T00:00:00Z`, days * 24);
}

async function writeDay(dir: string, date: string): Promise<string> {
  const file = path.join(dir, date.slice(0, 7), `${date}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  const hourly = legacyDay(date).map(h => ({
    time: h.time,
    temperature: h.temperature,
    apparentTemperature: h.apparentTemperature,
    precipitation: h.precipitation,
    weathercode: h.weatherCode,
    windspeed: h.windSpeed,
    winddirection: h.windDirection,
  }));
  await writeFile(file, JSON.stringify({ date, location: 'Heubach', hourly }));
  return file;
}

describe('Importe (Schritt 3, e2e mit gemocktem Provider, ohne Netz)', () => {
  let dataDir: string;
  let app: INestApplication<App>;
  let runner: ImportRunner;
  const clock = new FixedClock('2026-11-20T10:00:00Z');

  /** Der Provider wartet, bis der Test `release` aufruft (laufender Import für R19). */
  let release: () => void = () => undefined;
  let gate: Promise<void> = Promise.resolve();
  const provider = {
    fetchHourly: jest.fn(async (req: HourlyRequest) => {
      await gate;
      return hoursFor(req);
    }),
    fetchDailyForecast: jest.fn(async () => forecastDays('2026-11-20')),
  };

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'wetter-api-imports-'));
    await writeDay(dataDir, '2026-10-01');
    await writeDay(dataDir, '2026-10-02');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(LEGACY_DATA_DIR)
      .useValue(dataDir)
      .overrideProvider(OpenMeteoClient)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    runner = app.get(ImportRunner);
  });

  afterAll(async () => {
    release();
    await runner.whenIdle();
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('US07-2: vor dem ersten Import ist updateState "never"', async () => {
    const res = await request(app.getHttpServer()).get('/api/status').expect(200);
    expect(res.body).toMatchObject({ updateState: 'never', lastSuccessfulUpdateAt: null });
  });

  it('US10-3, R19, US11-1: 202 mit Location, 409 während des Laufs, danach succeeded; keine Datei geändert', async () => {
    const fileBefore = await readFile(path.join(dataDir, '2026-10', '2026-10-01.json'), 'utf-8');
    const mtimeBefore = (await stat(path.join(dataDir, '2026-10', '2026-10-01.json'))).mtimeMs;
    gate = new Promise(resolve => (release = resolve));

    const created = await request(app.getHttpServer())
      .post('/api/imports')
      .send({ kind: 'range', from: '2026-10-01', to: '2026-10-03' })
      .expect(202);
    expect(created.headers['location']).toBe('/api/imports/1');
    expect(created.body).toMatchObject({
      id: 1,
      locationId: 1,
      kind: 'range',
      status: 'queued',
      from: '2026-10-01',
      to: '2026-10-03',
      requestedAt: '2026-11-20T10:00:00Z',
      startedAt: null,
      finishedAt: null,
      counts: { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 },
      warnings: [],
      error: null,
      links: { self: '/api/imports/1' },
    });

    const conflict = await request(app.getHttpServer())
      .post('/api/imports')
      .send({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' })
      .expect(409);
    expect(conflict.body).toMatchObject({ statusCode: 409, runningImportId: 1 });

    const running = await request(app.getHttpServer()).get('/api/imports/1').expect(200);
    expect(running.body.status).toBe('running');

    release();
    await runner.whenIdle();

    const done = await request(app.getHttpServer()).get('/api/imports/1').expect(200);
    expect(done.body).toMatchObject({ status: 'succeeded', finishedAt: '2026-11-20T10:00:00Z', error: null });
    expect(done.body.counts.inserted).toBe(24);
    expect(done.body.counts.updated + done.body.counts.unchanged).toBe(48);

    const day = await request(app.getHttpServer()).get('/api/days/2026-10-03').expect(200);
    expect(day.body.hours).toHaveLength(24);

    // Nest schreibt nie in den Datenordner (Express bleibt der Schreiber).
    expect(await readFile(path.join(dataDir, '2026-10', '2026-10-01.json'), 'utf-8')).toBe(fileBefore);
    expect((await stat(path.join(dataDir, '2026-10', '2026-10-01.json'))).mtimeMs).toBe(mtimeBefore);
    expect((await readdir(path.join(dataDir, '2026-10'))).sort()).toEqual(['2026-10-01.json', '2026-10-02.json']);
    expect(await readdir(dataDir)).toEqual(['2026-10']);
  });

  it('R25: nach dem erfolgreichen Import updateState "ok"; Vorhersage aus dem Import', async () => {
    const status = await request(app.getHttpServer()).get('/api/status').expect(200);
    expect(status.body).toMatchObject({
      updateState: 'ok',
      lastSuccessfulUpdateAt: '2026-11-20T10:00:00Z',
      dataFrom: '2026-10-01',
      dataTo: '2026-10-03',
    });
    const forecasts = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
    expect(forecasts.body.items).toHaveLength(7);
    expect(forecasts.body.fetchedAt).toBe('2026-11-20T10:00:00Z');
  });

  it('US11-3: GET /api/imports/999 → 404, /api/imports/abc → 400', async () => {
    await request(app.getHttpServer()).get('/api/imports/999').expect(404);
    await request(app.getHttpServer()).get('/api/imports/abc').expect(400);
  });

  describe('Validierung des Bodys (Schritt 4: ImportCreateSchema, R18; R02 im Service)', () => {
    it.each([
      ['US10-4: from nach to', { kind: 'range', from: '2026-10-31', to: '2026-10-01' }, 'VALIDATION_FAILED', 'to', 'to_before_from'],
      ['US10-8: kind "scheduled"', { kind: 'scheduled', from: '2026-10-01', to: '2026-10-03' }, 'VALIDATION_FAILED', 'kind', 'invalid_value'],
      ['US10-6: 1097 Tage', { kind: 'range', from: '2023-01-01', to: '2026-01-01' }, 'VALIDATION_FAILED', 'to', 'range_too_long'],
      ['Zusatzfeld "x": 1', { kind: 'range', from: '2026-10-01', to: '2026-10-03', x: 1 }, 'VALIDATION_FAILED', 'x', 'unrecognized_keys'],
      ['US10-5: to = morgen', { kind: 'range', from: '2026-11-19', to: '2026-11-21' }, 'DATE_IN_FUTURE', 'to', 'too_big'],
      ['from fehlt', { kind: 'range', to: '2026-10-03' }, 'VALIDATION_FAILED', 'from', 'invalid_type'],
    ])('%s → 400', async (_name, body, code, field, fieldCode) => {
      const res = await request(app.getHttpServer()).post('/api/imports').send(body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request', code, details: null });
      expect(res.body.errors).toEqual([{ field, code: fieldCode, message: expect.any(String) }]);
      expect(res.headers['location']).toBeUndefined();
    });

    it('ungültige Aufträge legen keinen Import an', async () => {
      await request(app.getHttpServer()).get('/api/imports/2').expect(404);
    });

    it('GET /api/imports/abc → 400 mit field "id"', async () => {
      const res = await request(app.getHttpServer()).get('/api/imports/abc').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'id' })]);
    });
  });
});
