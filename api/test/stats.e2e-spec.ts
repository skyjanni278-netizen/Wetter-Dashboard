import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { loadFixture } from '../src/fixtures/fixture';
import type { Fixture } from '../src/fixtures/fixture';
import { createTestApp } from './support/app';
import { fixtureOf, seedApp } from './support/seed';

/** 14:30 MEZ am 19.11.2026 (03 B1.2). */
const NOW = '2026-11-19T13:30:00Z';

interface Harness {
  app: INestApplication<App>;
  clock: FixedClock;
  close(): Promise<void>;
}

/** App wie `main.ts` mit fester Uhr; die Fixture steht per `applySeed` in ihrer `:memory:`-Datenbank. */
async function startWith(fixture: Fixture, now = NOW): Promise<Harness> {
  const clock = new FixedClock(now);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Clock).useValue(clock).compile();
  const app = await createTestApp(moduleRef);
  await seedApp(app, fixture, clock.now());
  return { app, clock, close: () => app.close() };
}

function emptyFixture(observations: Fixture['observations'] = []): Fixture {
  return fixtureOf(observations);
}

describe('Fachregeln und berechnete Felder (Schritt 7, e2e mit Fixtures und FixedClock)', () => {
  describe('Fixture us16-ok, jetzt 14:30 MEZ', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await startWith(loadFixture('us16-ok'));
    });
    afterAll(() => h.close());

    it('US01-3: GET /api/days/today → ab 15:00 isPrediction, observed nur bis 14:00, predicted getrennt', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/days/today').expect(200);
      expect(res.headers['content-location']).toBe('/api/days/2026-11-19');
      expect(res.body).toMatchObject({
        id: '2026-11-19',
        date: '2026-11-19',
        isToday: true,
        hoursExpected: 24,
        hoursObserved: 15,
        hoursPredicted: 9,
        complete: false,
        current: { observationId: null, timeLocal: '2026-11-19T14:00' },
        observed: {
          temperature: { mean: 9, min: 8.4, max: 9.8, minAt: '2026-11-19T06:00', maxAt: '2026-11-19T13:00' },
          precipitationSum: 0.4,
          isDryDay: null,
        },
        predicted: { temperature: { min: 8.1, max: 9.4 }, precipitationSum: 5.4 },
      });
      const hours = res.body.hours as { timeLocal: string; isPrediction: boolean; source: string }[];
      expect(hours.filter(x => x.isPrediction).map(x => x.timeLocal.slice(11))).toEqual([
        '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
      ]);
      expect(hours[15]).toMatchObject({ source: 'prediction', isPrediction: true, correctedAt: null });
    });

    it('US01-6: current zeigt auf die Stunde 14:00 mit den Werten aus hours[]', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/days/today').expect(200);
      const current = (res.body.hours as { timeLocal: string }[]).find(x => x.timeLocal === res.body.current.timeLocal);
      expect(current).toMatchObject({
        temperature: 9.6,
        apparentTemperature: 5.1,
        precipitation: 0.4,
        windSpeed: 21.3,
        windDirection: 232,
        source: 'forecast_api',
        isPrediction: false,
      });
    });

    it('US16-1: GET /api/status → updateState "ok", letzter Erfolg 13:05:12Z', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/status').expect(200);
      expect(res.body).toMatchObject({
        today: '2026-11-19',
        dataFrom: '2026-11-10',
        dataTo: '2026-11-19',
        lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z',
        updateState: 'ok',
      });
    });

    it('US02-1: vergangener Tag → vollständig, current = null, keine Vorhersage', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/days/2026-11-10').expect(200);
      expect(res.body).toMatchObject({ isToday: false, complete: true, current: null, hoursObserved: 24, hoursPredicted: 0 });
      expect(typeof res.body.observed.isDryDay).toBe('boolean');
    });

    it('Vorhersage aus der Fixture: GET /api/forecasts', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/forecasts').expect(200);
      expect(res.body.fetchedAt).toBe('2026-11-19T13:05:12Z');
      expect(res.body.items).toHaveLength(7);
    });
  });

  describe('Fixture us16-delayed', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await startWith(loadFixture('us16-delayed'));
    });
    afterAll(() => h.close());

    it('US16-2: updateState "delayed"; heute nur bis 11:00 vergangen, 12–14 Uhr veraltete Vorhersage', async () => {
      const status = await request(h.app.getHttpServer()).get('/api/status').expect(200);
      expect(status.body).toMatchObject({ lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' });
      const day = await request(h.app.getHttpServer()).get('/api/days/today').expect(200);
      expect(day.body).toMatchObject({ hoursObserved: 12, hoursPredicted: 12, current: { timeLocal: '2026-11-19T11:00' } });
    });
  });

  it('US01-2 / F06: FixedClock 20.11. 00:30 MEZ → GET /api/days/today liefert den 20.11.', async () => {
    const fixture = emptyFixture([
      { timeUtc: '2026-11-19T22:00:00Z', temperature: 5, apparentTemperature: 2, precipitation: 0, weatherCode: 3, windSpeed: 10, windDirection: 200, source: 'forecast_api' },
      { timeUtc: '2026-11-19T23:00:00Z', temperature: 4.5, apparentTemperature: 1.5, precipitation: 0, weatherCode: 3, windSpeed: 10, windDirection: 200, source: 'forecast_api' },
    ]);
    const h = await startWith(fixture, '2026-11-19T23:30:00Z');
    try {
      const res = await request(h.app.getHttpServer()).get('/api/days/today').expect(200);
      expect(res.body).toMatchObject({ date: '2026-11-20', isToday: true, hoursObserved: 1, current: { timeLocal: '2026-11-20T00:00' } });
      expect(res.headers['content-location']).toBe('/api/days/2026-11-20');
    } finally {
      await h.close();
    }
  });

  describe('Fixture us02-dst (R07)', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await startWith(loadFixture('us02-dst'));
    });
    afterAll(() => h.close());

    it('US02-6: GET /api/days/2026-03-29 → hoursExpected 23, ohne 02:00, vollständig', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/days/2026-03-29').expect(200);
      expect(res.body).toMatchObject({ hoursExpected: 23, hoursObserved: 23, complete: true });
      expect((res.body.hours as { timeLocal: string }[]).map(x => x.timeLocal)).not.toContain('2026-03-29T02:00');
    });

    it('US02-7: GET /api/days/2026-10-25 → hoursExpected 25, zwei Stunden 02:00', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/days/2026-10-25').expect(200);
      expect(res.body).toMatchObject({ hoursExpected: 25, hoursObserved: 25, complete: true });
      expect((res.body.hours as { timeLocal: string }[]).filter(x => x.timeLocal === '2026-10-25T02:00')).toHaveLength(2);
    });
  });

  describe('Fixture us06-records (R10, R11)', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await startWith(loadFixture('us06-records'));
    });
    afterAll(() => h.close());

    it('US06-2/-3/-4: hottest 30.0 mit Datum von A, Trockenperiode 4 Tage, Vorhersage ignoriert', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/records').expect(200);
      expect(res.body).toEqual({
        locationId: 1,
        hottest: { value: 30, timeLocal: '2026-07-02T15:00', date: '2026-07-02', observationId: null, corrected: false },
        coldest: { value: 3.2, timeLocal: '2026-11-19T06:00', date: '2026-11-19', observationId: null, corrected: false },
        wettestDay: { value: 12.3, date: '2026-07-09' },
        longestDryPeriod: { days: 4, from: '2026-07-05', to: '2026-07-08' },
        daysCounted: 11,
        excludesPredictions: true,
      });
    });

    it('US06-6: GET /api/records?year=2025 → 400 unrecognized_keys an year', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/records?year=2025').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'year', code: 'unrecognized_keys' }] });
    });

    it('US04: GET /api/summaries/months/2026-07 → nur vollständige Tage, Mittel der Tagesmittel', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/summaries/months/2026-07').expect(200);
      expect(res.body).toMatchObject({
        id: '2026-07',
        year: 2026,
        month: 7,
        locationId: 1,
        daysExpected: 31,
        daysComplete: 9,
        complete: false,
        temperature: { max: 30, maxAt: '2026-07-02T15:00' },
        precipitationSum: 13.8,
        dryDays: 7,
        meanMethod: 'mean_of_daily_means',
      });
    });

    it('US05: GET /api/summaries/years/2026 → laufendes Jahr gültig, unvollständig, Monate mit Daten', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/summaries/years/2026').expect(200);
      expect(res.body).toMatchObject({
        id: '2026',
        year: 2026,
        daysExpected: 365,
        daysComplete: 11,
        monthsWithData: 3,
        complete: false,
        meanMethod: 'mean_of_daily_means',
      });
      expect(res.body.temperature.min).toBeGreaterThan(3.2); // der laufende Tag zählt nicht im Jahr
    });

    it.each([
      ['/api/summaries/months/2025-13', 'VALIDATION_FAILED', 'yearMonth'],
      ['/api/summaries/months/2026-12', 'DATE_IN_FUTURE', 'yearMonth'],
      ['/api/summaries/years/1939', 'VALIDATION_FAILED', 'year'],
      ['/api/summaries/years/26', 'VALIDATION_FAILED', 'year'],
      ['/api/summaries/years/2027', 'DATE_IN_FUTURE', 'year'],
    ])('%s → 400 %s an %s', async (url, code, field) => {
      const res = await request(h.app.getHttpServer()).get(url).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code, errors: [{ field }], path: url });
    });

    it.each([
      ['/api/summaries/months/2024-12', 'Für Dezember 2024 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
      ['/api/summaries/months/2026-08', 'Für August 2026 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
      ['/api/summaries/years/2024', 'Für das Jahr 2024 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
    ])('R03: %s → 404 NO_DATA mit details.dataFrom', async (url, message) => {
      const res = await request(h.app.getHttpServer()).get(url).expect(404);
      expect(res.body).toMatchObject({ code: 'NO_DATA', message, details: { dataFrom: '2026-06-29' } });
    });

    it('laufender Monat ist gültig (R02)', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/summaries/months/2026-11').expect(200);
      expect(res.body).toMatchObject({ daysExpected: 30, daysComplete: 0, complete: false, precipitationSum: null });
      expect(res.body.temperature.mean).toBeNull();
    });
  });

  it('US06-5: leere Daten → alle Rekorde null, daysCounted 0', async () => {
    const h = await startWith(emptyFixture());
    try {
      const res = await request(h.app.getHttpServer()).get('/api/records').expect(200);
      expect(res.body).toMatchObject({ hottest: null, coldest: null, wettestDay: null, longestDryPeriod: null, daysCounted: 0 });
      const month = await request(h.app.getHttpServer()).get('/api/summaries/months/2026-11').expect(404);
      expect(month.body).toMatchObject({ code: 'NO_DATA', details: { dataFrom: null } });
    } finally {
      await h.close();
    }
  });
});
