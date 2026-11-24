import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { loadFixture } from '../src/fixtures/fixture';
import type { Fixture } from '../src/fixtures/fixture';
import { createTestApp } from './support/app';
import { dayObservations, fixtureOf, seedApp } from './support/seed';

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
        current: { observationId: expect.any(Number), timeLocal: '2026-11-19T14:00' },
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
      // Schritt 12a: current.observationId ist die id der Stunde 14:00 aus hours[].
      expect(res.body.current.observationId).toBe((res.body.hours as { id: number }[])[14].id);
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
        hottest: { value: 30, timeLocal: '2026-07-02T15:00', date: '2026-07-02', observationId: expect.any(Number), corrected: false },
        coldest: { value: 3.2, timeLocal: '2026-11-19T06:00', date: '2026-11-19', observationId: expect.any(Number), corrected: false },
        wettestDay: { value: 12.3, date: '2026-07-09' },
        longestDryPeriod: { days: 4, from: '2026-07-05', to: '2026-07-08' },
        daysCounted: 11,
        excludesPredictions: true,
      });
    });

    it('Schritt 12a: observationId der Rekorde zeigt auf die Rekordstunde (GET /api/observations/:id)', async () => {
      const records = (await request(h.app.getHttpServer()).get('/api/records').expect(200)).body;
      const hottest = await request(h.app.getHttpServer()).get(`/api/observations/${records.hottest.observationId}`).expect(200);
      expect(hottest.body).toMatchObject({ timeLocal: '2026-07-02T15:00:00+02:00', temperature: 30.04, correctedAt: null });
      const coldest = await request(h.app.getHttpServer()).get(`/api/observations/${records.coldest.observationId}`).expect(200);
      expect(coldest.body).toMatchObject({ timeLocal: '2026-11-19T06:00:00+01:00', temperature: 3.2 });
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

    // US05-3 mit dem Altbestand (daysComplete = 322) prüft lists.e2e-spec.ts; hier dieselbe Form mit 11 Tagen der Fixture.
    it('US05-3 (Fixture): GET /api/summaries/years/2026 → 200, complete = false, daysComplete 11 von 365, Monate mit Daten', async () => {
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
      ['Format', '/api/summaries/months/2025-13', 'VALIDATION_FAILED', 'yearMonth'],
      ['US04-6', '/api/summaries/months/2026-12', 'DATE_IN_FUTURE', 'yearMonth'],
      ['US05-4', '/api/summaries/years/1939', 'VALIDATION_FAILED', 'year'],
      ['Format', '/api/summaries/years/26', 'VALIDATION_FAILED', 'year'],
      ['R02', '/api/summaries/years/2027', 'DATE_IN_FUTURE', 'year'],
    ])('%s: %s → 400 %s an %s', async (_id, url, code, field) => {
      const res = await request(h.app.getHttpServer()).get(url).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code, errors: [{ field }], path: url });
    });

    it.each([
      ['US04-5', '/api/summaries/months/2024-12', 'Für Dezember 2024 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
      ['Monat ohne Daten', '/api/summaries/months/2026-08', 'Für August 2026 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
      ['US05-5', '/api/summaries/years/2024', 'Für das Jahr 2024 liegen keine Daten vor. Daten gibt es ab 29.06.2026.'],
    ])('%s (R03): %s → 404 NO_DATA mit details.dataFrom', async (_id, url, message) => {
      const res = await request(h.app.getHttpServer()).get(url).expect(404);
      expect(res.body).toMatchObject({ code: 'NO_DATA', message, details: { dataFrom: '2026-06-29' } });
    });

    it('laufender Monat ist gültig (R02)', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/summaries/months/2026-11').expect(200);
      expect(res.body).toMatchObject({ daysExpected: 30, daysComplete: 0, complete: false, precipitationSum: null });
      expect(res.body.temperature.mean).toBeNull();
    });
  });

  it('US01-5 / F15: Tag mit einer Stunde temperature = null → min der vorhandenen Werte, nie 0, complete = false', async () => {
    // 18.11.2026: Temperatur 10,0 + h/10 °C, um 00:00 null; ohne F15-Fehler ist das Minimum 10,1 °C um 01:00.
    const h = await startWith(fixtureOf(dayObservations('2026-11-18', hour => (hour === 0 ? { temperature: null } : {}))));
    try {
      const res = await request(h.app.getHttpServer()).get('/api/days/2026-11-18').expect(200);
      expect(res.body.hours[0]).toMatchObject({ timeLocal: '2026-11-18T00:00', temperature: null });
      expect(res.body).toMatchObject({
        complete: false,
        observed: { temperature: { min: 10.1, minAt: '2026-11-18T01:00', max: 12.3, maxAt: '2026-11-18T23:00' } },
      });
      expect(res.body.observed.temperature.min).not.toBe(0);
    } finally {
      await h.close();
    }
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

describe('Schritt 12b: Kenntage (R27, US18) und freier Zeitraum (R28, US19), e2e mit Fixtures und FixedClock', () => {
  /** Kennzahlen der Fixture us18-indicators für Oktober 2026 (Beschreibung in test/fixtures/README.md). */
  const OCTOBER_INDICATORS = { frostDays: 2, iceDays: 1, summerDays: 2, hotDays: 1, precipitationDays: 2 };

  describe('Fixture us18-indicators (sechs vollständige Tage 01.–06.10.2026, 07.10. unvollständig mit Min −5)', () => {
    let h: Harness;
    const get = (url: string) => request(h.app.getHttpServer()).get(url);
    beforeAll(async () => {
      h = await startWith(loadFixture('us18-indicators'));
    });
    afterAll(() => h.close());

    it('US18-2: GET /api/summaries/months/2026-10 → frostDays 2, iceDays 1, summerDays 2, hotDays 1', async () => {
      const res = await get('/api/summaries/months/2026-10').expect(200);
      expect(res.body).toMatchObject({ daysExpected: 31, daysComplete: 6, complete: false, dryDays: 4 });
      expect(res.body.indicators).toEqual(OCTOBER_INDICATORS);
      // Reihenfolge wie B2.2: indicators zwischen dryDays und meanMethod, dryDays nicht doppelt
      expect(Object.keys(res.body).slice(-3)).toEqual(['dryDays', 'indicators', 'meanMethod']);
    });

    it('US18-3: der unvollständige 07.10. mit Min −5 °C zählt nicht in frostDays (complete = false)', async () => {
      const day = await get('/api/days/2026-10-07').expect(200);
      expect(day.body).toMatchObject({ complete: false, hoursObserved: 23, observed: { temperature: { min: -5 } } });
      const month = await get('/api/summaries/months/2026-10').expect(200);
      expect(month.body.temperature.min).toBe(-3);
      expect(month.body.indicators.frostDays).toBe(2);
    });

    it('US18-1: Ganzzahlen ≥ 0, iceDays ≤ frostDays, hotDays ≤ summerDays, precipitationDays + dryDays = daysComplete', async () => {
      const { body } = await get('/api/summaries/months/2026-10').expect(200);
      for (const value of Object.values(body.indicators as Record<string, number>)) {
        expect(Number.isInteger(value) && value >= 0).toBe(true);
      }
      expect(body.indicators.iceDays).toBeLessThanOrEqual(body.indicators.frostDays);
      expect(body.indicators.hotDays).toBeLessThanOrEqual(body.indicators.summerDays);
      expect(body.indicators.precipitationDays + body.dryDays).toBe(body.daysComplete);
    });

    it('US18-4: Jahr und Monatsliste tragen indicators; frostDays des Jahres = Summe der Monate', async () => {
      const year = await get('/api/summaries/years/2026').expect(200);
      expect(year.body.indicators).toEqual(OCTOBER_INDICATORS);
      expect(Object.keys(year.body).slice(-3)).toEqual(['dryDays', 'indicators', 'meanMethod']);
      const months = await get('/api/summaries/months?year=2026').expect(200);
      const items = months.body.items as { id: string; indicators: { frostDays: number } }[];
      expect(items.map(m => m.id)).toEqual(['2026-10']);
      expect(items.reduce((sum, m) => sum + m.indicators.frostDays, 0)).toBe(year.body.indicators.frostDays);
    });

    it('R28: GET /api/summaries/periods?from=2026-10-01&to=2026-10-06 → vollständig, Form wie B2.2 „period summary“', async () => {
      const res = await get('/api/summaries/periods?from=2026-10-01&to=2026-10-06').expect(200);
      expect(Object.keys(res.body)).toEqual([
        'id', 'from', 'to', 'locationId', 'daysExpected', 'daysComplete', 'complete',
        'temperature', 'precipitationSum', 'dryDays', 'indicators', 'meanMethod',
      ]);
      expect(res.body).toEqual({
        id: '2026-10-01..2026-10-06',
        from: '2026-10-01',
        to: '2026-10-06',
        locationId: 1,
        daysExpected: 6,
        daysComplete: 6,
        complete: true,
        temperature: { mean: expect.any(Number), min: -3, max: 30, minAt: '2026-10-06T05:00', maxAt: '2026-10-05T14:00' },
        precipitationSum: 2.6,
        dryDays: 4,
        indicators: OCTOBER_INDICATORS,
        meanMethod: 'mean_of_daily_means',
      });
    });

    it('R28: ein ganzer Monat als Zeitraum ergibt dieselben Werte wie die Monatszusammenfassung', async () => {
      const month = (await get('/api/summaries/months/2026-10').expect(200)).body;
      const period = (await get('/api/summaries/periods?from=2026-10-01&to=2026-10-31').expect(200)).body;
      const { id: _m, year: _y, month: _mo, ...monthValues } = month;
      const { id, from: _f, to: _t, ...periodValues } = period;
      expect(id).toBe('2026-10-01..2026-10-31');
      expect(periodValues).toEqual(monthValues);
    });

    it('R28-Grenze: from = to → 200, ein Tag', async () => {
      const res = await get('/api/summaries/periods?from=2026-10-03&to=2026-10-03').expect(200);
      expect(res.body).toMatchObject({ id: '2026-10-03..2026-10-03', daysExpected: 1, daysComplete: 1, complete: true });
      expect(res.body.indicators).toEqual({ frostDays: 0, iceDays: 0, summerDays: 1, hotDays: 0, precipitationDays: 1 });
    });

    it('nur der unvollständige Tag → 200, alle Kennzahlen 0, Werte null', async () => {
      const res = await get('/api/summaries/periods?from=2026-10-07&to=2026-10-07').expect(200);
      expect(res.body).toMatchObject({ daysComplete: 0, complete: false, precipitationSum: null, dryDays: 0 });
      expect(res.body.indicators).toEqual({ frostDays: 0, iceDays: 0, summerDays: 0, hotDays: 0, precipitationDays: 0 });
    });
  });

  describe('freier Zeitraum mit Daten am 01.03.2025 und 01.01.2026 (jetzt 19.11.2026 14:30 MEZ)', () => {
    let h: Harness;
    const get = (url: string) => request(h.app.getHttpServer()).get(url);
    beforeAll(async () => {
      h = await startWith(fixtureOf([...dayObservations('2025-03-01'), ...dayObservations('2026-01-01')]));
    });
    afterAll(() => h.close());

    it('US19-1: from=2025-01-01&to=2025-11-18 → 200, id, daysExpected 322, indicators und meanMethod', async () => {
      const res = await get('/api/summaries/periods?from=2025-01-01&to=2025-11-18').expect(200);
      expect(res.body).toMatchObject({
        id: '2025-01-01..2025-11-18',
        from: '2025-01-01',
        to: '2025-11-18',
        locationId: 1,
        daysExpected: 322,
        daysComplete: 1,
        complete: false,
        dryDays: 1,
        indicators: { frostDays: 0, iceDays: 0, summerDays: 0, hotDays: 0, precipitationDays: 0 },
        meanMethod: 'mean_of_daily_means',
      });
    });

    it('US19-2: from=2025-11-18&to=2025-01-01 → 400 to_before_from an to', async () => {
      const res = await get('/api/summaries/periods?from=2025-11-18&to=2025-01-01').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'to', code: 'to_before_from' }] });
    });

    it('US19-3: genau 366 Tage (2025-01-01..2026-01-01) → 200; 367 Tage (to=2026-01-02) → 400 range_too_long an to', async () => {
      const ok = await get('/api/summaries/periods?from=2025-01-01&to=2026-01-01').expect(200);
      expect(ok.body).toMatchObject({ daysExpected: 366, daysComplete: 2 });
      const res = await get('/api/summaries/periods?from=2025-01-01&to=2026-01-02').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'to', code: 'range_too_long' }] });
    });

    it('US19-4: from=2024-01-01&to=2024-11-18 → 404 NO_DATA mit details.dataFrom', async () => {
      const res = await get('/api/summaries/periods?from=2024-01-01&to=2024-11-18').expect(404);
      expect(res.body).toMatchObject({
        code: 'NO_DATA',
        message: 'Für den Zeitraum 01.01.2024 bis 18.11.2024 liegen keine Daten vor. Daten gibt es ab 01.03.2025.',
        details: { dataFrom: '2025-03-01' },
      });
    });

    it('US19-5: to=2026-11-20 (morgen) → 400 DATE_IN_FUTURE an to; to = heute ist erlaubt (hier ohne Daten → 404)', async () => {
      const res = await get('/api/summaries/periods?from=2026-11-01&to=2026-11-20').expect(400);
      expect(res.body).toMatchObject({ code: 'DATE_IN_FUTURE', errors: [{ field: 'to', code: 'too_big' }] });
      const today = await get('/api/summaries/periods?from=2026-11-01&to=2026-11-19').expect(404);
      expect(today.body.code).toBe('NO_DATA');
    });

    it('US19-6: …&compare=previous → 400 VALIDATION_FAILED, errors[0] = compare / unrecognized_keys', async () => {
      const res = await get('/api/summaries/periods?from=2025-01-01&to=2025-11-18&compare=previous').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(res.body.errors[0]).toMatchObject({ field: 'compare', code: 'unrecognized_keys' });
    });

    it.each([
      ['/api/summaries/periods?from=2025-1-01&to=2025-11-18', 'from', 'invalid_date'],
      ['/api/summaries/periods?from=2025-01-01&to=2025-02-30', 'to', 'invalid_date'],
      ['/api/summaries/periods?from=2025-01-01', 'to', 'invalid_type'],
    ])('R28 Format: %s → 400 an %s (%s)', async (url, field, code) => {
      const res = await get(url).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field, code }] });
    });

    it('Accept: text/html → 406 (B3.1)', async () => {
      await get('/api/summaries/periods?from=2025-01-01&to=2025-11-18').set('Accept', 'text/html').expect(406);
    });
  });
});
