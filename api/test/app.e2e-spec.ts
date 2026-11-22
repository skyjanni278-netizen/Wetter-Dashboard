import { rm } from 'node:fs/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { createTestApp } from './support/app';
import { importLegacy, legacyForecastDays, tempDir, writeLegacyDay, writeLegacyForecast } from './support/legacy-files';

/** Stunden im Altformat von Express; Stunde 5 ohne Temperatur. */
function hourly(date: string) {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature: hour === 5 ? null : 5 + hour / 10,
    apparentTemperature: 2.25,
    precipitation: 0.04,
    weathercode: 3,
    windspeed: 12.34,
    winddirection: 220,
  }));
}

/**
 * Altdateien im Temp-Ordner, per Altdatenimport (`LegacyImporter`, derselbe Code wie `cli import:legacy`) in
 * die `:memory:`-Datenbank der App geschrieben. Änderungszeit der Dateien = Uhr des Tests (Abrufzeitpunkt, R08).
 * Im Winter ist die Regel `fixed+01:00` gleich der Berliner Zeit, die Ortszeiten bleiben also, wie sie sind.
 */
describe('Erste GET-Endpunkte (Schritt 2, e2e mit importierten Altdateien)', () => {
  let dataDir: string;
  let app: INestApplication<App>;
  const clock = new FixedClock('2026-11-19T13:30:00Z');

  async function writeDay(date: string): Promise<void> {
    await writeLegacyDay(dataDir, date, { hourly: hourly(date), modifiedAt: clock.now().toISOString() });
  }

  beforeAll(async () => {
    dataDir = await tempDir('wetter-api-e2e-');
    await writeDay('2025-01-01');
    await writeDay('2026-11-10');
    await writeDay('2026-11-19');
    await writeLegacyForecast(dataDir, legacyForecastDays(19), '2026-11-19T13:05:00Z');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Clock).useValue(clock).compile();
    app = await createTestApp(moduleRef);
    await importLegacy(app, dataDir, clock);
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

  it('GET /api/locations/2147483648 → 400 too_big an id (größer als MAX_ID)', async () => {
    const res = await request(app.getHttpServer()).get('/api/locations/2147483648').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'id', code: 'too_big' }] });
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
      // Herkunft nach Z2: nach dem 08.11.2026 aus der Forecast-API.
      source: 'forecast_api',
      isPrediction: false,
      correctedAt: null,
    });
    expect(res.body.hours[5].temperature).toBeNull();
  });

  it('Herkunft Z2: Tage bis 08.11.2026 sind archive', async () => {
    const res = await request(app.getHttpServer()).get('/api/days/2025-01-01').expect(200);
    expect(new Set(res.body.hours.map((h: { source: string }) => h.source))).toEqual(new Set(['archive']));
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

  it('US01-2: um 00:30 MEZ ist heute der 20.11.; nach erneutem Altdatenimport ohne Neustart da', async () => {
    clock.set('2026-11-19T23:30:00Z');
    await request(app.getHttpServer()).get('/api/days/today').expect(404);

    await writeDay('2026-11-20');
    await importLegacy(app, dataDir, clock);
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
    expect(res.body.fetchedAt).toBe('2026-11-19T13:05:00Z');
    expect(res.body.items[0].fetchedAt).toBe(res.body.fetchedAt);
  });

  it('eine neuere forecast.json ersetzt nach erneutem Import die Vorhersage (jüngstes fetchedAt)', async () => {
    await writeLegacyForecast(dataDir, legacyForecastDays(20), '2026-11-19T14:05:00Z');
    await importLegacy(app, dataDir, clock);
    const res = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
    expect(res.body.items[0].date).toBe('2026-11-20');
    expect(res.body.fetchedAt).toBe('2026-11-19T14:05:00Z');
  });

  it('US07-1/-2: GET /api/status mit updateState "never" (kind legacy zählt nicht, R25) und ohne Fehlertext', async () => {
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
      await writeDay('2026-11-20');
      await importLegacy(app, dataDir, clock);
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
});

describe('Ohne Daten (leere Datenbank)', () => {
  it('US03-2: ohne Vorhersage → GET /api/forecasts liefert items = [], fetchedAt = null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = await createTestApp(moduleRef);
    try {
      const res = await request(app.getHttpServer()).get('/api/forecasts').expect(200);
      expect(res.body).toEqual({ items: [], fetchedAt: null });
    } finally {
      await app.close();
    }
  });
});
