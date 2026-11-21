import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { Clock, FixedClock } from '../../src/common/clock';
import { ACTIVE_FIXTURE } from '../../src/fixtures/fixture';
import { LEGACY_DATA_DIR } from '../../src/legacy/legacy-data-dir';
import { createTestApp } from '../support/app';

/**
 * Charakterisierung (03 B2.7 Schritt 9, Roadmap Schritt 7): vergleicht die neue API (Nest, Altbestand aus
 * `backend/data`, nur lesend) mit den Golden Files der Express-API. Toleranz 0,05. Jede Abweichung muss in
 * `expected-differences.json` mit F-/R-Nummer und Begründung stehen; die Abbildung der Felder steht in
 * `README.md`. Braucht kein laufendes Express. Ohne `backend/data` (nicht im Git) wird der Test übersprungen.
 */
const DATA_DIR = path.resolve(__dirname, '../../../backend/data');
const GOLDEN_DIR = path.join(__dirname, 'golden');
const TOLERANCE = 0.05;
/** Fester Zeitpunkt nach dem Aufnahmetag (19.11.2026); spätere Dateien in `backend/data` stören nicht. */
const NOW = '2026-11-20T12:00:00Z';

interface ExpectedDifference {
  pattern: string;
  ref: string;
  reason: string;
  /** Gewollter Unterschied, der im Altbestand nicht vorkommt (in Unit-/e2e-Tests abgedeckt). */
  mayBeAbsent?: boolean;
}

interface Deviation {
  key: string;
  golden: unknown;
  actual: unknown;
}

const expected: ExpectedDifference[] = JSON.parse(
  readFileSync(path.join(__dirname, 'expected-differences.json'), 'utf-8'),
).differences;

function golden<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf-8')) as T;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOLERANCE + 1e-9;
  return a === b;
}

interface GoldenHour {
  time: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weathercode: number | null;
  windspeed: number | null;
  winddirection: number | null;
}

const HOUR_FIELDS: [keyof GoldenHour, string][] = [
  ['temperature', 'temperature'],
  ['apparentTemperature', 'apparentTemperature'],
  ['precipitation', 'precipitation'],
  ['weathercode', 'weatherCode'],
  ['windspeed', 'windSpeed'],
  ['winddirection', 'windDirection'],
];

const run = existsSync(DATA_DIR) ? describe : describe.skip;

run('Charakterisierung: neue API gegenüber den Golden Files von Express', () => {
  let app: INestApplication<App>;
  const deviations: Deviation[] = [];
  const dayCache = new Map<string, Record<string, any>>();

  const check = (key: string, goldenValue: unknown, actual: unknown) => {
    if (!sameValue(goldenValue, actual)) deviations.push({ key, golden: goldenValue, actual });
  };

  async function get(url: string): Promise<Record<string, any>> {
    const res = await request(app.getHttpServer()).get(url);
    if (res.status !== 200) throw new Error(`${url} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as Record<string, any>;
  }

  async function day(date: string): Promise<Record<string, any>> {
    const cached = dayCache.get(date);
    if (cached) return cached;
    const body = await get(`/api/days/${date}`);
    dayCache.set(date, body);
    return body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new FixedClock(NOW))
      .overrideProvider(LEGACY_DATA_DIR)
      .useValue(DATA_DIR)
      .overrideProvider(ACTIVE_FIXTURE)
      .useValue(null)
      .compile();
    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('Tage (day-*.json): jede Stunde und jeder Wert', async () => {
    const files = readdirSync(GOLDEN_DIR).filter(name => name.startsWith('day-'));
    expect(files).toHaveLength(10);
    for (const file of files) {
      const g = golden<{ date: string; hourly: GoldenHour[] }>(file);
      const body = await day(g.date);
      const hours = body.hours as Record<string, unknown>[];
      check(`day:${g.date}:hours`, g.hourly.length, hours.length);
      g.hourly.forEach(gh => {
        const hour = hours.find(h => h.timeLocal === gh.time);
        for (const [goldenField, field] of HOUR_FIELDS) {
          check(`day:${g.date}:${gh.time.slice(11)}:${field}`, gh[goldenField], hour?.[field]);
        }
      });
    }
  });

  it('Monate (month-*.json): Tagesmittel und Tagessumme je Tag, Zahl der Tage', async () => {
    const files = readdirSync(GOLDEN_DIR).filter(name => name.startsWith('month-'));
    expect(files).toHaveLength(23);
    for (const file of files) {
      const g = golden<{ year: string; month: string; data: { day: number; avgTemp: number; totalPrecip: number }[] }>(file);
      const ym = `${g.year}-${g.month}`;
      for (const entry of g.data) {
        const date = `${ym}-${String(entry.day).padStart(2, '0')}`;
        const body = await day(date);
        check(`month:${ym}:${date}:avgTemp`, entry.avgTemp, body.observed.temperature.mean);
        check(`month:${ym}:${date}:totalPrecip`, entry.totalPrecip, body.observed.precipitationSum);
      }
      const summary = await get(`/api/summaries/months/${ym}`);
      check(`month:${ym}:days`, g.data.length, summary.daysComplete);
      expect(summary.meanMethod).toBe('mean_of_daily_means');
    }
  });

  it('Jahre (year-*.json): Monatsmittel und -summen; Jahresmittel und -summe', async () => {
    for (const year of [2025, 2026]) {
      const g = golden<{ data: { month: number; avgTemp: number; totalPrecip: number }[] }>(`year-${year}.json`);
      for (const entry of g.data) {
        const ym = `${year}-${String(entry.month).padStart(2, '0')}`;
        const summary = await get(`/api/summaries/months/${ym}`);
        check(`year:${year}:${ym}:avgTemp`, entry.avgTemp, summary.temperature.mean);
        check(`year:${year}:${ym}:totalPrecip`, entry.totalPrecip, summary.precipitationSum);
      }
      const summary = await get(`/api/summaries/years/${year}`);
      // Das Frontend (yearly-page.ts) zeigt das Mittel der Monatsmittel und die Summe der Monatssummen.
      const meanOfMonths = g.data.reduce((s, m) => s + m.avgTemp, 0) / g.data.length;
      const sumOfMonths = g.data.reduce((s, m) => s + m.totalPrecip, 0);
      check(`year:${year}:mean`, Math.round(meanOfMonths * 10) / 10, summary.temperature.mean);
      check(`year:${year}:precipitationSum`, Math.round(sumOfMonths * 10) / 10, summary.precipitationSum);
      check(`year:${year}:monthsWithData`, g.data.length, summary.monthsWithData);
    }
  });

  it('US05-1: GET /api/summaries/years/2025 → complete = true, meanMethod = "mean_of_daily_means"', async () => {
    const summary = await get('/api/summaries/years/2025');
    expect(summary).toMatchObject({ daysExpected: 365, daysComplete: 365, complete: true, meanMethod: 'mean_of_daily_means' });
    const y2026 = await get('/api/summaries/years/2026');
    expect(y2026).toMatchObject({ daysExpected: 365, complete: false });
  });

  it('Rekorde (stats.json → /api/records)', async () => {
    const g = golden<{
      hottestDay: { date: string; value: number };
      coldestDay: { date: string; value: number };
      rainiestDay: { date: string; value: number };
      driestStreak: { days: number; from: string; to: string };
      totalDays: number;
    }>('stats.json');
    const records = await get('/api/records');
    check('stats:hottest:date', g.hottestDay.date, records.hottest?.date);
    check('stats:hottest:value', g.hottestDay.value, records.hottest?.value);
    check('stats:coldest:date', g.coldestDay.date, records.coldest?.date);
    check('stats:coldest:value', g.coldestDay.value, records.coldest?.value);
    check('stats:wettest:date', g.rainiestDay.date, records.wettestDay?.date);
    check('stats:wettest:value', g.rainiestDay.value, records.wettestDay?.value);
    check('stats:dryPeriod:days', g.driestStreak.days, records.longestDryPeriod?.days);
    check('stats:dryPeriod:from', g.driestStreak.from, records.longestDryPeriod?.from);
    check('stats:dryPeriod:to', g.driestStreak.to, records.longestDryPeriod?.to);
    check('stats:totalDays', g.totalDays, records.daysCounted);
    expect(records.excludesPredictions).toBe(true);
  });

  it('Abweichungen nur aus der Liste „erwartet anders“ (expected-differences.json)', () => {
    const patterns = expected.map(e => ({ ...e, regex: new RegExp(e.pattern) }));
    const unexplained = deviations.filter(d => !patterns.some(p => p.regex.test(d.key)));
    expect(unexplained).toEqual([]);
    // Jeder Listeneintrag soll auch vorkommen, sonst ist die Liste veraltet.
    const unused = patterns
      .filter(p => !p.mayBeAbsent && !deviations.some(d => p.regex.test(d.key)))
      .map(p => p.pattern);
    expect(unused).toEqual([]);
  });
});
