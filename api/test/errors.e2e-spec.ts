import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { LocationsService } from '../src/locations/locations.service';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { dayObservations, fixtureOf, seedApp } from './support/seed';

const REQUEST_ID = /^[0-9a-f]{8}$/;

/** Kein Test darf Open-Meteo aufrufen; ein Import entsteht hier ohnehin nie. */
const offlineProvider = {
  fetchHourly: jest.fn(async () => {
    throw new Error('kein Netz im Test');
  }),
  fetchDailyForecast: jest.fn(async () => {
    throw new Error('kein Netz im Test');
  }),
};

describe('Fehlerformat und Statuscodes (Schritt 5, B3.2/B3.3)', () => {
  let app: INestApplication<App>;
  // 20.11.2026, 11:00 Berlin: heute gibt es keine Stunde, morgen ist der 21.11.
  const clock = new FixedClock('2026-11-20T10:00:00Z');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(OpenMeteoClient)
      .useValue(offlineProvider)
      .compile();
    app = await createTestApp(moduleRef);
    // Zwei Tage in der `:memory:`-Datenbank (applySeed wie `db:seed --fixture`).
    await seedApp(app, fixtureOf([...dayObservations('2025-01-01'), ...dayObservations('2026-11-19')]), clock.now());
  });

  afterAll(async () => {
    await app.close();
  });

  it('US02-5, R03: GET /api/days/2024-12-31 → 404 NO_DATA, Meldung nennt 01.01.2025, details.dataFrom', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/2024-12-31').expect(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NO_DATA',
      message: 'Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab 01.01.2025.',
      errors: [],
      path: '/api/days/2024-12-31',
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(REQUEST_ID),
      details: { dataFrom: '2025-01-01' },
    });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('R03: heute ohne Datei → 404 NO_DATA (kein Content-Location)', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/today').expect(404);
    expect(res.body).toMatchObject({ code: 'NO_DATA', path: '/api/days/today', details: { dataFrom: '2025-01-01' } });
    expect(res.body.message).toContain('20.11.2026');
    expect(res.headers['content-location']).toBeUndefined();
  });

  it('US02-4, R02: GET /api/days/<morgen> → 400 DATE_IN_FUTURE mit path, timestamp, requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/2026-11-21').expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'DATE_IN_FUTURE',
      message: 'Das Datum liegt in der Zukunft. Erlaubt ist höchstens heute (20.11.2026).',
      errors: [{ field: 'date', code: 'too_big', message: expect.stringContaining('20.11.2026') }],
      path: '/api/days/2026-11-21',
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
  });

  it('US01-4: Accept: text/html → 406 NOT_ACCEPTABLE als JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/today').set('Accept', 'text/html').expect(406);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({
      statusCode: 406,
      error: 'Not Acceptable',
      code: 'NOT_ACCEPTABLE',
      errors: [],
      path: '/api/days/today',
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
  });

  it('Accept application/json, */*, Browser-Standard und ohne Accept → 200 mit X-Request-Id', async () => {
    for (const accept of ['application/json', '*/*', 'text/html,application/xhtml+xml,*/*;q=0.8']) {
      const res = await request(app.getHttpServer()).get('/api/locations').set('Accept', accept).expect(200);
      expect(res.headers['x-request-id']).toMatch(REQUEST_ID);
    }
    const res = await request(app.getHttpServer()).get('/api/locations').unset('Accept').expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('POST /api/imports mit Content-Type text/plain → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/imports')
      .set('Content-Type', 'text/plain')
      .send('x')
      .expect(415);
    expect(res.body).toMatchObject({
      statusCode: 415,
      error: 'Unsupported Media Type',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      errors: [],
      path: '/api/imports',
    });
  });

  it('POST /api/imports mit JSON über 64 KB → 413 PAYLOAD_TOO_LARGE', async () => {
    const body = { kind: 'range', from: '2026-10-01', to: '2026-10-03', pad: 'x'.repeat(70 * 1024) };
    const res = await request(app.getHttpServer()).post('/api/imports').send(body).expect(413);
    expect(res.body).toMatchObject({
      statusCode: 413,
      error: 'Payload Too Large',
      code: 'PAYLOAD_TOO_LARGE',
      errors: [],
      path: '/api/imports',
      requestId: expect.stringMatching(REQUEST_ID),
    });
  });

  it('knapp unter 64 KB wird gelesen und von der Pipe geprüft (400 am Zusatzfeld, nicht 413)', async () => {
    const body = { kind: 'range', from: '2026-10-01', to: '2026-10-03', pad: 'x'.repeat(60 * 1024) };
    const res = await request(app.getHttpServer()).post('/api/imports').send(body).expect(400);
    expect(res.body.errors).toEqual([expect.objectContaining({ field: 'pad', code: 'unrecognized_keys' })]);
  });

  it('kaputtes JSON → 400 VALIDATION_FAILED ohne Text des Parsers', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/imports')
      .set('Content-Type', 'application/json')
      .send('{"kind": ')
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Der Body ist kein gültiges JSON.',
      errors: [],
      path: '/api/imports',
      details: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|JSON at position|SyntaxError/);
  });

  it('GET /api/gibtsnicht → 404 NOT_FOUND als JSON, kein HTML', async () => {
    const res = await request(app.getHttpServer()).get('/api/gibtsnicht').expect(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.text).not.toContain('<');
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NOT_FOUND',
      message: 'Die angefragte Ressource gibt es nicht.',
      errors: [],
      path: '/api/gibtsnicht',
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
  });

  it('unbekannte Methode auf bekanntem Pfad (DELETE /api/locations/1) → 404 im Fehlerformat', async () => {
    const res = await request(app.getHttpServer()).delete('/api/locations/1').expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', path: '/api/locations/1' });
  });

  it('US07-4: GET /api/locations/99 → 404 NOT_FOUND im Fehlerformat', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations/99').expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NOT_FOUND',
      message: 'Den Standort 99 gibt es nicht.',
      errors: [],
      path: '/api/locations/99',
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
  });

  it('jede Anfrage bekommt eine eigene requestId', async () => {
    const a = await request(app.getHttpServer()).get('/api/gibtsnicht');
    const b = await request(app.getHttpServer()).get('/api/gibtsnicht');
    expect(a.body.requestId).not.toBe(b.body.requestId);
  });
});

describe('Unerwarteter Fehler im Service (Schritt 5: 500 ohne Stacktrace)', () => {
  let app: INestApplication<App>;
  const failing = {
    findAll: () => {
      throw new Error('geheim: SQLITE_BUSY in /srv/wetter/db.sqlite');
    },
    findOne: async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'id')");
    },
  };

  beforeAll(async () => {
    const clock = new FixedClock('2026-11-20T10:00:00Z');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(OpenMeteoClient)
      .useValue(offlineProvider)
      .overrideProvider(LocationsService)
      .useValue(failing)
      .compile();
    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/api/locations', '/api/locations/1'])('GET %s → 500, message "Interner Fehler", kein stack', async url => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = await request(app.getHttpServer()).get(url).expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Interner Fehler',
      errors: [],
      path: url,
      timestamp: '2026-11-20T10:00:00Z',
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
    expect(res.body).not.toHaveProperty('stack');
    expect(res.text).not.toMatch(/geheim|SQLITE|Cannot read|\.ts:\d+|at /);
    // Die Details gehen mit der requestId ins Log.
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`[${res.body.requestId}]`), expect.any(String));
    log.mockRestore();
  });
});
