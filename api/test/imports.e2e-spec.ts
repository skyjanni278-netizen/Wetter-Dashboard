import { rm } from 'node:fs/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { ImportRunner } from '../src/imports/import-runner';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import type { HourlyRequest, ProviderHour } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { forecastDays, providerHours } from './support/fakes';
import { importLegacy, tempDir, writeLegacyDay } from './support/legacy-files';

/** Stunden für die angefragten UTC-Tage, wie Open-Meteo sie mit `timezone=GMT` liefert. */
function hoursFor(req: HourlyRequest): ProviderHour[] {
  const days = (Date.parse(`${req.endDate}T00:00:00Z`) - Date.parse(`${req.startDate}T00:00:00Z`)) / 86_400_000 + 1;
  return providerHours(`${req.startDate}T00:00:00Z`, days * 24);
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
    // Altbestand 01.–02.10.2026 als Import 1 (kind = legacy, Regel fixed+01:00: Berliner 01.10. 01:00 bis 03.10. 00:00).
    dataDir = await tempDir('wetter-api-imports-');
    await writeLegacyDay(dataDir, '2026-10-01', { modifiedAt: '2026-11-19T13:36:00Z' });
    await writeLegacyDay(dataDir, '2026-10-02', { modifiedAt: '2026-11-19T13:36:00Z' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(OpenMeteoClient)
      .useValue(provider)
      .compile();
    app = await createTestApp(moduleRef);
    runner = app.get(ImportRunner);
    await importLegacy(app, dataDir, clock);
  });

  afterAll(async () => {
    release();
    await runner.whenIdle();
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('US07-2: vor dem ersten Import über die API ist updateState "never" (legacy zählt nicht, R25)', async () => {
    const res = await request(app.getHttpServer()).get('/api/status').expect(200);
    expect(res.body).toMatchObject({ updateState: 'never', lastSuccessfulUpdateAt: null });
  });

  it('US15-2: GET /api/imports?kind=legacy → der Altdatenimport mit 48 Stunden', async () => {
    const res = await request(app.getHttpServer()).get('/api/imports?kind=legacy').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      id: 1,
      kind: 'legacy',
      status: 'succeeded',
      from: '2026-10-01',
      to: '2026-10-02',
      counts: { inserted: 48, updated: 0, unchanged: 0, skippedCorrected: 0 },
      error: null,
    });
    // Protokoll: Regel, Herkunft, Stundenzahl der Randtage (Sommer, fixed+01:00), ohne forecast.json nur ein Hinweis.
    expect(res.body.items[0].warnings.map((w: { code: string; message: string }) => `${w.code} ${w.message.slice(0, 10)}`)).toEqual([
      'LEGACY_TIME_RULE Ortszeiten',
      'LEGACY_SOURCES Herkunft (',
      'LEGACY_HOURS_PER_DAY 2026-10-01',
      'LEGACY_HOURS_PER_DAY 2026-10-03',
      'LEGACY_NO_FORECAST forecast.j',
    ]);
  });

  it('US10-3, R19, US11-1: 202 mit Location, 409 während des Laufs, danach succeeded', async () => {
    gate = new Promise(resolve => (release = resolve));

    const created = await request(app.getHttpServer())
      .post('/api/imports')
      .send({ kind: 'range', from: '2026-10-01', to: '2026-10-03' })
      .expect(202);
    expect(created.headers['location']).toBe('/api/imports/2');
    expect(created.body).toMatchObject({
      id: 2,
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
      links: { self: '/api/imports/2' },
    });

    const conflict = await request(app.getHttpServer())
      .post('/api/imports')
      .send({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' })
      .expect(409);
    expect(conflict.body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'IMPORT_RUNNING',
      errors: [],
      path: '/api/imports',
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(/^[0-9a-f]{8}$/),
      details: { runningImportId: 2 },
    });
    expect(conflict.headers['location']).toBeUndefined();

    const running = await request(app.getHttpServer()).get('/api/imports/2').expect(200);
    expect(running.body.status).toBe('running');

    release();
    await runner.whenIdle();

    const done = await request(app.getHttpServer()).get('/api/imports/2').expect(200);
    expect(done.body).toMatchObject({ status: 'succeeded', finishedAt: '2026-11-20T10:00:00Z', error: null });
    // 48 der 72 Berliner Stunden gibt es aus dem Altbestand schon (andere Werte → updated), 24 sind neu.
    expect(done.body.counts.inserted).toBe(24);
    expect(done.body.counts.updated + done.body.counts.unchanged).toBe(48);

    const day = await request(app.getHttpServer()).get('/api/days/2026-10-03').expect(200);
    expect(day.body.hours).toHaveLength(24);
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
    const missing = await request(app.getHttpServer()).get('/api/imports/999').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', path: '/api/imports/999', details: null });
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
      await request(app.getHttpServer()).get('/api/imports/3').expect(404);
    });

    it('GET /api/imports/abc → 400 mit field "id"', async () => {
      const res = await request(app.getHttpServer()).get('/api/imports/abc').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'id' })]);
    });
  });
});
