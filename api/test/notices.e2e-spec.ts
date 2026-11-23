import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { loadFixture } from '../src/fixtures/fixture';
import type { Fixture } from '../src/fixtures/fixture';
import { createTestApp } from './support/app';
import { fixtureOf, seedApp } from './support/seed';

/**
 * Schritt 12c (Roadmap „Fertig, wenn …“, US20-1 bis -5, R30, R31): `GET /api/notices` mit Fixtures und fester Uhr
 * (14:30 MEZ am 19.11.2026), ohne Anmeldung (öffentlich, B4.7). Die Datenbank ist `:memory:` mit allen Migrationen,
 * also auch der Daten-Migration `Hinweisschwellen`.
 */
const NOW = '2026-11-19T13:30:00Z';
const FETCHED_AT = '2026-11-19T13:05:12Z';

type FixtureForecastDay = NonNullable<Fixture['forecast']>['days'][number];

interface Harness {
  app: INestApplication<App>;
  dataSource: DataSource;
  get(url: string): request.Test;
  close(): Promise<void>;
}

async function startWith(fixture: Fixture): Promise<Harness> {
  const clock = new FixedClock(NOW);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Clock).useValue(clock).compile();
  const app = await createTestApp(moduleRef);
  await seedApp(app, fixture, clock.now());
  return {
    app,
    dataSource: app.get(DataSource),
    get: (url: string) => request(app.getHttpServer()).get(url),
    close: () => app.close(),
  };
}

function day(date: string, values: Partial<FixtureForecastDay> = {}): FixtureForecastDay {
  return { date, maxTemp: 8, minTemp: 2, precipitationSum: 0, weatherCode: 3, ...values };
}

function withForecast(days: FixtureForecastDay[]): Fixture {
  return fixtureOf([], { forecast: { fetchedAt: FETCHED_AT, days } });
}

describe('GET /api/notices (Schritt 12c, US20, R30, R31)', () => {
  describe('Fixture us20-frost', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await startWith(loadFixture('us20-frost'));
    });
    afterAll(() => h.close());

    it('US20-1: minTemp −2,3 am 21.11. → 200 mit genau dem Frost-Hinweis, basedOnFetchedAt 13:05:12Z (ohne Token)', async () => {
      const res = await h.get('/api/notices').expect(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        items: [
          { id: '2026-11-21-frost', type: 'frost', date: '2026-11-21', value: -2.3, threshold: 0, comparator: 'lt', unit: '°C' },
        ],
        basedOnFetchedAt: FETCHED_AT,
      });
    });

    it('US20-5: ?days=3 → 400 VALIDATION_FAILED, errors[0] = { field: "days", code: "unrecognized_keys" }', async () => {
      const res = await h.get('/api/notices?days=3').expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED', path: '/api/notices' });
      expect(res.body.errors[0]).toMatchObject({ field: 'days', code: 'unrecognized_keys' });
    });

    it('406 bei Accept: text/html (B3.1)', async () => {
      const res = await h.get('/api/notices').set('Accept', 'text/html').expect(406);
      expect(res.body.code).toBe('NOT_ACCEPTABLE');
    });

    it('R30/B2.6: UPDATE notice_threshold SET comparator = \'xx\' → CHECK-Fehler, Stammdaten unverändert', async () => {
      await expect(h.dataSource.query(`UPDATE "notice_threshold" SET "comparator" = 'xx'`)).rejects.toThrow(
        /CHECK constraint failed: CHK_notice_threshold_comparator/,
      );
      expect(await h.dataSource.query(`SELECT "type", "field", "comparator", "value", "unit" FROM "notice_threshold" ORDER BY "id"`)).toEqual([
        { type: 'frost', field: 'min_temp', comparator: 'lt', value: 0, unit: '°C' },
        { type: 'heat', field: 'max_temp', comparator: 'gte', value: 30, unit: '°C' },
        { type: 'heavy_rain', field: 'precipitation_sum', comparator: 'gte', value: 20, unit: 'mm' },
      ]);
    });
  });

  it('US20-2: Grenzwerte −0,1 / 0,0 · 30,0 / 29,9 · 20,0 / 19,9 → Hinweis nur bei −0,1, 30,0 und 20,0', async () => {
    const h = await startWith(
      withForecast([
        day('2026-11-19', { minTemp: -0.1 }),
        day('2026-11-20', { minTemp: 0 }),
        day('2026-11-21', { maxTemp: 30, minTemp: 15 }),
        day('2026-11-22', { maxTemp: 29.9, minTemp: 15 }),
        day('2026-11-23', { precipitationSum: 20 }),
        day('2026-11-24', { precipitationSum: 19.9 }),
        day('2026-11-25', { maxTemp: null, minTemp: null, precipitationSum: null }),
      ]),
    );
    try {
      const res = await h.get('/api/notices').expect(200);
      expect(res.body.items.map((n: { id: string; value: number }) => [n.id, n.value])).toEqual([
        ['2026-11-19-frost', -0.1],
        ['2026-11-21-heat', 30],
        ['2026-11-23-heavy_rain', 20],
      ]);
      expect(res.body.basedOnFetchedAt).toBe(FETCHED_AT);
    } finally {
      await h.close();
    }
  });

  it('US20-3: leere Tabelle daily_forecast → 200, items = [], basedOnFetchedAt = null', async () => {
    const h = await startWith(fixtureOf());
    try {
      expect(await h.dataSource.query(`SELECT COUNT(*) AS "n" FROM "daily_forecast"`)).toEqual([{ n: 0 }]);
      const res = await h.get('/api/notices').expect(200);
      expect(res.body).toEqual({ items: [], basedOnFetchedAt: null });
    } finally {
      await h.close();
    }
  });

  it('US20-4 (R31): gespeicherte Vorhersage für gestern mit minTemp −4 → kein Hinweis; heute zählt mit', async () => {
    const h = await startWith(withForecast([day('2026-11-18', { minTemp: -4 }), day('2026-11-19', { minTemp: -1 })]));
    try {
      const res = await h.get('/api/notices').expect(200);
      expect(res.body.items.map((n: { id: string }) => n.id)).toEqual(['2026-11-19-frost']);
    } finally {
      await h.close();
    }
  });
});
