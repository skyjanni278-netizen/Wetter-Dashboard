import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { loadFixture } from '../src/fixtures/fixture';
import type { Fixture } from '../src/fixtures/fixture';
import { emptyCounts } from '../src/imports/import';
import type { ImportKind, ImportStatus } from '../src/imports/import';
import { IMPORT_STORE } from '../src/imports/import.store';
import type { ImportStore } from '../src/imports/import.store';
import { createTestApp } from './support/app';
import { useLegacyStores } from './support/legacy-stores';

/** Prüfzeitpunkt der Roadmap: 14:30 MEZ am 19.11.2026 (`FAKE_NOW=2026-11-19T13:30:00Z`). */
const NOW = '2026-11-19T13:30:00Z';
/** Altbestand von Express (nur lesend, nicht im Git); ohne ihn wird der erste Block übersprungen. */
const DATA_DIR = path.resolve(__dirname, '../../backend/data');

const runWithData = existsSync(DATA_DIR) ? describe : describe.skip;

async function start(options: { dataDir?: string; fixture?: Fixture | null }) {
  const emptyDir = options.dataDir ? null : await mkdtemp(path.join(tmpdir(), 'wetter-lists-e2e-'));
  const clock = new FixedClock(NOW);
  const moduleRef = await useLegacyStores(
    Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Clock).useValue(clock),
    { clock, dataDir: options.dataDir ?? emptyDir!, fixture: options.fixture ?? null },
  ).compile();
  const app = await createTestApp(moduleRef);
  return {
    app,
    close: async () => {
      await app.close();
      if (emptyDir) await rm(emptyDir, { recursive: true, force: true });
    },
  };
}

runWithData('Schritt 8: Listen und Zusammenfassungen mit backend/data (Fertig-Kriterien der Roadmap)', () => {
  let app: INestApplication<App>;
  let close: () => Promise<void>;
  const get = (url: string) => request(app.getHttpServer()).get(url);

  beforeAll(async () => {
    ({ app, close } = await start({ dataDir: DATA_DIR }));
  });
  afterAll(() => close());

  it('US04-1: GET /api/summaries/months/2025-03 → 200, complete = true', async () => {
    const res = await get('/api/summaries/months/2025-03').expect(200);
    expect(res.body).toMatchObject({ id: '2025-03', complete: true, daysComplete: 31, daysExpected: 31 });
  });

  it('US04-4: GET /api/summaries/months/2026-11 → 200, daysComplete = 18 von 30', async () => {
    const res = await get('/api/summaries/months/2026-11').expect(200);
    expect(res.body).toMatchObject({ complete: false, daysComplete: 18, daysExpected: 30 });
  });

  it('US04-3: GET /api/summaries/months/2026-13 → 400 am Feld yearMonth', async () => {
    const res = await get('/api/summaries/months/2026-13').expect(400);
    expect(res.body.errors[0]).toMatchObject({ field: 'yearMonth' });
  });

  it('US04-5: GET /api/summaries/months/2024-12 → 404 NO_DATA', async () => {
    const res = await get('/api/summaries/months/2024-12').expect(404);
    expect(res.body.code).toBe('NO_DATA');
  });

  it('US04-7: GET /api/days?from=2025-01-01&to=2026-11-19 → 400 range_too_long an to', async () => {
    const res = await get('/api/days?from=2025-01-01&to=2026-11-19').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'to', code: 'range_too_long' }] });
  });

  it('US04-8: GET /api/summaries/years → 200, items 2025 und 2026 (aufsteigend)', async () => {
    const res = await get('/api/summaries/years').expect(200);
    expect(res.body).toEqual({
      items: [
        { id: '2025', year: 2025, complete: true, daysComplete: 365 },
        { id: '2026', year: 2026, complete: false, daysComplete: expect.any(Number) },
      ],
    });
  });

  it('US04-6: GET /api/summaries/months/2026-12 → 400 DATE_IN_FUTURE', async () => {
    const res = await get('/api/summaries/months/2026-12').expect(400);
    expect(res.body.code).toBe('DATE_IN_FUTURE');
  });

  it('US04-9: GET /api/days?from=2026-11-01&to=2026-11-30 → 400 DATE_IN_FUTURE an to', async () => {
    const res = await get('/api/days?from=2026-11-01&to=2026-11-30').expect(400);
    expect(res.body).toMatchObject({ code: 'DATE_IN_FUTURE', errors: [{ field: 'to', code: 'too_big' }] });
  });

  it('US04-9: GET /api/days?from=2026-11-01&to=2026-11-19 → 200, 19 Einträge aufsteigend, meta', async () => {
    const res = await get('/api/days?from=2026-11-01&to=2026-11-19').expect(200);
    const dates = (res.body.items as { date: string }[]).map(i => i.date);
    expect(dates).toHaveLength(19);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe('2026-11-01');
    expect(dates[18]).toBe('2026-11-19');
    expect(res.body.meta).toEqual({ from: '2026-11-01', to: '2026-11-19', count: 19 });
    // Listeneintrag nach B2.2, ohne Stunden; heute (19.11.) ist unvollständig.
    expect(Object.keys(res.body.items[0])).toEqual([
      'id', 'date', 'locationId', 'hoursExpected', 'hoursObserved', 'complete',
      'temperature', 'precipitationSum', 'isDryDay', 'hasCorrections',
    ]);
    expect(res.body.items[18]).toMatchObject({ date: '2026-11-19', complete: false, isDryDay: null, hoursObserved: 15 });
  });

  it('US04-2: GET /api/days?from=2025-03-01&to=2025-03-31 → 31 Einträge, Werte wie GET /api/days/:date', async () => {
    const res = await get('/api/days?from=2025-03-01&to=2025-03-31').expect(200);
    expect(res.body.items).toHaveLength(31);
    const single = await get('/api/days/2025-03-15').expect(200);
    const entry = res.body.items.find((i: { date: string }) => i.date === '2025-03-15');
    expect(entry).toMatchObject({
      complete: single.body.complete,
      hoursObserved: single.body.hoursObserved,
      temperature: {
        mean: single.body.observed.temperature.mean,
        min: single.body.observed.temperature.min,
        max: single.body.observed.temperature.max,
      },
      precipitationSum: single.body.observed.precipitationSum,
      isDryDay: single.body.observed.isDryDay,
    });
  });

  it('feste Sortierung: GET /api/days?…&sort=desc → 400 unrecognized_keys an sort', async () => {
    const res = await get('/api/days?from=2026-11-01&to=2026-11-19&sort=desc').expect(400);
    expect(res.body.errors).toEqual([{ field: 'sort', code: 'unrecognized_keys', message: expect.any(String) }]);
  });

  it('US05-6: GET /api/summaries/months?year=abc → 400 am Feld year', async () => {
    const res = await get('/api/summaries/months?year=abc').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'year' }] });
  });

  it('US05-2: GET /api/summaries/months?year=2025 → 200, 12 Monate aufsteigend, wie /months/{ym}', async () => {
    const res = await get('/api/summaries/months?year=2025').expect(200);
    const ids = (res.body.items as { id: string }[]).map(i => i.id);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`));
    const march = await get('/api/summaries/months/2025-03').expect(200);
    expect(res.body.items[2]).toEqual(march.body);
  });

  it('GET /api/summaries/months?year=2026 → nur Monate mit Daten, bis zum laufenden Monat', async () => {
    const res = await get('/api/summaries/months?year=2026').expect(200);
    const ids = (res.body.items as { id: string }[]).map(i => i.id);
    expect(ids.at(-1)).toBe('2026-11');
    const november = await get('/api/summaries/months/2026-11').expect(200);
    expect(res.body.items.at(-1)).toEqual(november.body);
  });

  it('GET /api/summaries/months?year=2027 / 2024 → 400 DATE_IN_FUTURE an year / 404 NO_DATA', async () => {
    const future = await get('/api/summaries/months?year=2027').expect(400);
    expect(future.body).toMatchObject({ code: 'DATE_IN_FUTURE', errors: [{ field: 'year' }] });
    const empty = await get('/api/summaries/months?year=2024').expect(404);
    expect(empty.body).toMatchObject({ code: 'NO_DATA', details: { dataFrom: '2025-01-01' } });
  });

  it('US11-4: GET /api/imports?limit=500 / ?limit=0 / ?page=0 → 400 an limit / limit / page', async () => {
    expect((await get('/api/imports?limit=500').expect(400)).body.errors).toEqual([
      { field: 'limit', code: 'too_big', message: expect.any(String) },
    ]);
    expect((await get('/api/imports?limit=0').expect(400)).body.errors[0]).toMatchObject({ field: 'limit', code: 'too_small' });
    expect((await get('/api/imports?page=0').expect(400)).body.errors[0]).toMatchObject({ field: 'page', code: 'too_small' });
  });

  it('GET /api/imports → 200 { items, meta } (ohne Nest-Importe leer)', async () => {
    const res = await get('/api/imports').expect(200);
    expect(res.body).toEqual({ items: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it('V35: GET /api/status → dataFrom/dataTo aus dem Observation-Store', async () => {
    const res = await get('/api/status').expect(200);
    expect(res.body.dataFrom).toBe('2025-01-01');
    expect(res.body.dataTo >= '2026-11-19').toBe(true);
  });

  it('today und :date bleiben unberührt', async () => {
    const today = await get('/api/days/today').expect(200);
    expect(today.headers['content-location']).toBe('/api/days/2026-11-19');
    await get('/api/days/2026-11-10').expect(200);
  });
});

describe('Schritt 8: Listen ohne Altbestand (Fixture bzw. leerer Store)', () => {
  it('ohne Daten: /api/summaries/years → items = [], /api/days?… → items = [] (R03), months?year → 404', async () => {
    const h = await start({ fixture: null });
    try {
      const server = h.app.getHttpServer();
      expect((await request(server).get('/api/summaries/years').expect(200)).body).toEqual({ items: [] });
      expect((await request(server).get('/api/days?from=2026-11-01&to=2026-11-19').expect(200)).body).toEqual({
        items: [],
        meta: { from: '2026-11-01', to: '2026-11-19', count: 0 },
      });
      const res = await request(server).get('/api/summaries/months?year=2026').expect(404);
      expect(res.body).toMatchObject({ code: 'NO_DATA', details: { dataFrom: null } });
      await request(server).get('/api/summaries/years?year=2026').expect(400);
    } finally {
      await h.close();
    }
  });

  it('Fixture us16-ok: from = to (1 Tag) und Jahresliste nur 2026', async () => {
    const h = await start({ fixture: loadFixture('us16-ok') });
    try {
      const server = h.app.getHttpServer();
      const one = await request(server).get('/api/days?from=2026-11-19&to=2026-11-19').expect(200);
      expect(one.body.meta.count).toBe(1);
      expect(one.body.items[0]).toMatchObject({ date: '2026-11-19', hoursObserved: 15, complete: false });
      const years = await request(server).get('/api/summaries/years').expect(200);
      expect(years.body.items.map((i: { year: number }) => i.year)).toEqual([2026]);
    } finally {
      await h.close();
    }
  });

  describe('US11-2: GET /api/imports mit mehreren Importen', () => {
    let h: Awaited<ReturnType<typeof start>>;

    beforeAll(async () => {
      h = await start({ fixture: null });
      const store = h.app.get<ImportStore>(IMPORT_STORE);
      const add = async (kind: ImportKind, status: ImportStatus, requestedAt: string) => {
        const record = await store.create({
          locationId: 1,
          kind,
          from: '2026-11-18',
          to: '2026-11-19',
          overwriteCorrections: false,
          requestedBy: null,
          requestedAt,
          counts: emptyCounts(),
          warnings: [],
        });
        await store.update(record.id, { status, startedAt: requestedAt, finishedAt: requestedAt });
      };
      await add('scheduled', 'succeeded', '2026-11-19T11:05:00Z'); // 1
      await add('range', 'failed', '2026-11-19T13:10:00Z'); // 2
      await add('scheduled', 'failed', '2026-11-19T09:05:00Z'); // 3
      await add('gaps', 'partial', '2026-11-19T12:00:00Z'); // 4
    });
    afterAll(() => h.close());

    const get = (url: string) => request(h.app.getHttpServer()).get(url);

    it('ohne Filter: requestedAt absteigend, meta = { page: 1, limit: 20, total: 4 }', async () => {
      const res = await get('/api/imports').expect(200);
      expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([2, 4, 1, 3]);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4 });
      expect(res.body.items[0]).toMatchObject({ id: 2, kind: 'range', status: 'failed', links: { self: '/api/imports/2' } });
    });

    it('status=failed&page=1&limit=20 (US11-2) → nur fehlgeschlagene, absteigend', async () => {
      const res = await get('/api/imports?status=failed&page=1&limit=20').expect(200);
      expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([2, 3]);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2 });
    });

    it('kind=scheduled → nur geplante', async () => {
      const res = await get('/api/imports?kind=scheduled').expect(200);
      expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([1, 3]);
    });

    it('page=2&limit=3 → letzter Eintrag; page=3 → items = [], total bleibt', async () => {
      const second = await get('/api/imports?page=2&limit=3').expect(200);
      expect(second.body.items.map((i: { id: number }) => i.id)).toEqual([3]);
      expect(second.body.meta).toEqual({ page: 2, limit: 3, total: 4 });
      const third = await get('/api/imports?page=3&limit=3').expect(200);
      expect(third.body).toEqual({ items: [], meta: { page: 3, limit: 3, total: 4 } });
    });

    it('ungültige Werte → 400 am Feld (status, kind, limit=101, unbekannter Parameter)', async () => {
      expect((await get('/api/imports?status=done').expect(400)).body.errors[0]).toMatchObject({ field: 'status' });
      expect((await get('/api/imports?kind=all').expect(400)).body.errors[0]).toMatchObject({ field: 'kind' });
      expect((await get('/api/imports?limit=101').expect(400)).body.errors[0]).toMatchObject({ field: 'limit', code: 'too_big' });
      expect((await get('/api/imports?sort=asc').expect(400)).body.errors[0]).toMatchObject({
        field: 'sort',
        code: 'unrecognized_keys',
      });
    });

    it('GET /api/imports/:id bleibt unberührt', async () => {
      await get('/api/imports/4').expect(200);
      await get('/api/imports/99').expect(404);
    });
  });
});
