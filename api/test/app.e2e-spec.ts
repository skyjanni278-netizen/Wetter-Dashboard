import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { LEGACY_DATA_DIR } from '../src/legacy/legacy-data-dir';
import { createTestApp } from './support/app';

/** Tagesdatei im Altformat von Express; Stunde 5 ohne Temperatur. */
function dayFile(date: string): string {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature: hour === 5 ? null : 5 + hour / 10,
    apparentTemperature: 2.25,
    precipitation: 0.04,
    weathercode: 3,
    windspeed: 12.34,
    winddirection: 220,
  }));
  return JSON.stringify({ date, location: 'Heubach', hourly }, null, 2);
}

function forecastFile(firstDay: number): string {
  return JSON.stringify(
    Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-${String(firstDay + i).padStart(2, '0')}`,
      maxTemp: 8.6,
      minTemp: 7.1,
      precipitation: 9.23,
      weathercode: 80,
    })),
  );
}

async function writeDay(dir: string, date: string): Promise<void> {
  await mkdir(path.join(dir, date.slice(0, 7)), { recursive: true });
  await writeFile(path.join(dir, date.slice(0, 7), `${date}.json`), dayFile(date));
}

describe('Erste GET-Endpunkte (Schritt 2, e2e mit Altdateien im Temp-Ordner)', () => {
  let dataDir: string;
  let app: INestApplication<App>;
  const clock = new FixedClock('2026-11-19T13:30:00Z');

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'wetter-api-e2e-'));
    await writeDay(dataDir, '2025-01-01');
    await writeDay(dataDir, '2026-11-10');
    await writeDay(dataDir, '2026-11-19');
    await writeFile(path.join(dataDir, 'forecast.json'), forecastFile(19));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(LEGACY_DATA_DIR)
      .useValue(dataDir)
      .compile();
    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => clock.set('2026-11-19T13:30:00Z'));

  it('US07-3: GET /api/locations liefert genau Heubach', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: 1, slug: 'heubach', name: 'Heubach', timezone: 'Europe/Berlin' });
  });

  it('GET /api/locations/1 liefert Heubach', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations/1').expect(200);
    expect(res.body.slug).toBe('heubach');
  });

  it('US07-4: GET /api/locations/99 → 404 NOT_FOUND im Fehlerformat', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations/99').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: '/api/locations/99', errors: [] });
  });

  it('GET /api/locations/abc → 400 mit field "id"', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations/abc').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'id', code: 'invalid_format' }] });
  });

  it('US02-1: GET /api/days/2026-11-10 liefert 24 Stunden, Werte ungerundet, null bleibt null', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/2026-11-10').expect(200);
    expect(res.body).toMatchObject({
      id: '2026-11-10',
      date: '2026-11-10',
      locationId: 1,
      timezone: 'Europe/Berlin',
      isToday: false,
      hoursExpected: 24,
    });
    expect(res.body.hours).toHaveLength(24);
    expect(res.body.hours[0]).toEqual({
      timeLocal: '2026-11-10T00:00',
      temperature: 5,
      apparentTemperature: 2.25,
      precipitation: 0.04,
      weatherCode: 3,
      windSpeed: 12.34,
      windDirection: 220,
      source: null,
      isPrediction: false,
      correctedAt: null,
    });
    expect(res.body.hours[5].temperature).toBeNull();
  });

  it('US02-5: GET /api/days/2024-12-31 ohne Daten → 404 NO_DATA', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/2024-12-31').expect(404);
    expect(res.body).toMatchObject({ code: 'NO_DATA', details: { dataFrom: '2025-01-01' } });
  });

  it('US01-1: GET /api/days/today liefert das Berliner Datum und Content-Location', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/today').expect(200);
    expect(res.body.date).toBe('2026-11-19');
    expect(res.body.isToday).toBe(true);
    expect(res.headers['content-location']).toBe('/api/days/2026-11-19');
  });

  it('US01-2: um 00:30 MEZ ist heute der 20.11.; die neue Datei wird ohne Neustart gelesen', async () => {
    clock.set('2026-11-19T23:30:00Z');
    await request(app.getHttpServer()).get('/api/days/today').expect(404);

    await writeDay(dataDir, '2026-11-20');
    const res = await request(app.getHttpServer()).get('/api/days/today').expect(200);
    expect(res.body.date).toBe('2026-11-20');
    expect(res.headers['content-location']).toBe('/api/days/2026-11-20');
  });

  it('US03-1: GET /api/forecasts liefert 7 Einträge und fetchedAt', async () => {
    const res = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
    expect(res.body.items).toHaveLength(7);
    expect(res.body.items[0]).toMatchObject({
      locationId: 1,
      date: '2026-11-19',
      maxTemp: 8.6,
      minTemp: 7.1,
      precipitationSum: 9.23,
      weatherCode: 80,
    });
    expect(typeof res.body.fetchedAt).toBe('string');
    expect(res.body.items[0].fetchedAt).toBe(res.body.fetchedAt);
  });

  it('forecast.json wird bei jeder Anfrage neu gelesen', async () => {
    await writeFile(path.join(dataDir, 'forecast.json'), forecastFile(20));
    const res = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
    expect(res.body.items[0].date).toBe('2026-11-20');
  });

  it('US07-1/-2: GET /api/status mit updateState "never" und ohne Fehlertext', async () => {
    const res = await request(app.getHttpServer()).get('/api/status').expect(200);
    expect(res.body).toEqual({
      locationId: 1,
      today: '2026-11-19',
      timezone: 'Europe/Berlin',
      dataFrom: '2025-01-01',
      dataTo: expect.stringMatching(/^2026-11-(19|20)$/),
      lastSuccessfulUpdateAt: null,
      updateState: 'never',
    });
  });

  describe('Validierung mit Zod (Schritt 4, B3.3)', () => {
    it('US02-2: GET /api/days/2026-02-30 → 400, errors[0] = { field: "date", code: "invalid_date" }', async () => {
      const res = await request(app.getHttpServer()).get('/api/days/2026-02-30').expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
        message: 'Die Anfrage enthält ungültige Werte.',
        errors: [{ field: 'date', code: 'invalid_date', message: 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.' }],
        path: '/api/days/2026-02-30',
        timestamp: '2026-11-19T13:30:00Z',
        requestId: expect.stringMatching(/^[0-9a-f]{8}$/),
        details: null,
      });
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });

    it('US02-3: GET /api/days/2026-11-1 → 400, field "date"', async () => {
      const res = await request(app.getHttpServer()).get('/api/days/2026-11-1').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'date', code: 'invalid_date' })]);
    });

    it('US02-4: GET /api/days/<morgen> → 400 DATE_IN_FUTURE, field "date"; um 00:00 MEZ ist es heute', async () => {
      const res = await request(app.getHttpServer()).get('/api/days/2026-11-20').expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'DATE_IN_FUTURE', errors: [{ field: 'date' }] });

      clock.set('2026-11-19T23:00:00Z');
      await writeDay(dataDir, '2026-11-20');
      await request(app.getHttpServer()).get('/api/days/2026-11-20').expect(200);
    });

    it('US03-3: GET /api/forecasts?days=14 → 400, errors[0] = { field: "days", code: "unrecognized_keys" }', async () => {
      const res = await request(app.getHttpServer()).get('/api/forecasts?days=14').expect(400);
      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'days', code: 'unrecognized_keys', message: 'Das Feld „days“ ist nicht erlaubt.' }],
      });
    });
  });

  it('US03-2: ohne forecast.json → items = [], fetchedAt = null', async () => {
    await rm(path.join(dataDir, 'forecast.json'));
    const res = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
    expect(res.body).toEqual({ items: [], fetchedAt: null });
  });
});
