import type { Repository } from 'typeorm';
import { FixedClock } from '../common/clock';
import type { ForecastDay, ForecastStore, StoredForecast } from '../forecasts/forecast.store';
import { exceedsThreshold, R30_THRESHOLDS } from './notice';
import type { NoticeThreshold } from './notice-threshold.entity';
import { NoticesService } from './notices.service';

/** 14:30 MEZ am 19.11.2026 (03 B1.2); heute = 2026-11-19. */
const NOW = '2026-11-19T13:30:00Z';
const FETCHED_AT = '2026-11-19T13:05:12Z';

/** Schwellen wie nach der Daten-Migration `Hinweisschwellen` (ids 1–3). */
const THRESHOLDS: NoticeThreshold[] = R30_THRESHOLDS.map((t, i) => ({ id: i + 1, ...t }));

function forecastDay(date: string, values: Partial<ForecastDay> = {}): ForecastDay {
  return { date, maxTemp: 8, minTemp: 2, precipitationSum: 0, weatherCode: 3, ...values };
}

function serviceWith(days: ForecastDay[] | null, now = NOW, thresholds = THRESHOLDS): NoticesService {
  const stored: StoredForecast | null = days ? { days, fetchedAt: FETCHED_AT, importId: 1 } : null;
  const store: ForecastStore = { getLatest: async () => stored, save: async () => undefined };
  const repository = { find: async () => thresholds } as unknown as Repository<NoticeThreshold>;
  return new NoticesService(store, repository, new FixedClock(now));
}

describe('exceedsThreshold (R30, ungerundet)', () => {
  it.each([
    [-0.1, 'lt', 0, true],
    [0, 'lt', 0, false],
    [-0.01, 'lt', 0, true],
    [30, 'gte', 30, true],
    [29.9, 'gte', 30, false],
    [29.99, 'gte', 30, false],
    [20, 'gte', 20, true],
    [19.9, 'gte', 20, false],
    [19.96, 'gte', 20, false],
  ] as const)('%s %s %s → %s', (value, comparator, threshold, expected) => {
    expect(exceedsThreshold(value, comparator, threshold)).toBe(expected);
  });

  it('null → kein Hinweis', () => {
    expect(exceedsThreshold(null, 'lt', 0)).toBe(false);
    expect(exceedsThreshold(null, 'gte', 30)).toBe(false);
  });
});

describe('NoticesService (US20, R30, R31)', () => {
  it('US20-1: Frost am 21.11. mit minTemp -2,3 → genau ein Hinweis, basedOnFetchedAt = Abrufzeit', async () => {
    const result = await serviceWith([forecastDay('2026-11-19'), forecastDay('2026-11-21', { minTemp: -2.3, maxTemp: 2.4 })]).findAll();
    expect(result).toEqual({
      items: [
        { id: '2026-11-21-frost', type: 'frost', date: '2026-11-21', value: -2.3, threshold: 0, comparator: 'lt', unit: '°C' },
      ],
      basedOnFetchedAt: FETCHED_AT,
    });
  });

  it('US20-2 Frost: minTemp −0,1 → Hinweis, 0,0 → keiner', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-20', { minTemp: -0.1 }),
      forecastDay('2026-11-21', { minTemp: 0 }),
    ]).findAll();
    expect(result.items.map(n => n.id)).toEqual(['2026-11-20-frost']);
    expect(result.items[0].value).toBe(-0.1);
  });

  it('US20-2 Hitze: maxTemp 30,0 → Hinweis, 29,9 → keiner', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-20', { maxTemp: 30, minTemp: 18 }),
      forecastDay('2026-11-21', { maxTemp: 29.9, minTemp: 18 }),
    ]).findAll();
    expect(result.items).toEqual([
      { id: '2026-11-20-heat', type: 'heat', date: '2026-11-20', value: 30, threshold: 30, comparator: 'gte', unit: '°C' },
    ]);
  });

  it('US20-2 Starkregen: precipitationSum 20,0 → Hinweis, 19,9 → keiner', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-20', { precipitationSum: 20 }),
      forecastDay('2026-11-21', { precipitationSum: 19.9 }),
    ]).findAll();
    expect(result.items).toEqual([
      { id: '2026-11-20-heavy_rain', type: 'heavy_rain', date: '2026-11-20', value: 20, threshold: 20, comparator: 'gte', unit: 'mm' },
    ]);
  });

  it('Vergleich ungerundet: 29,96 °C und 19,96 mm (gerundet 30,0 / 20,0) ergeben keinen Hinweis, −0,04 °C schon', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-20', { maxTemp: 29.96, minTemp: -0.04, precipitationSum: 19.96 }),
    ]).findAll();
    expect(result.items.map(n => [n.type, n.value])).toEqual([['frost', 0]]);
  });

  it('Werte null → kein Hinweis (R30)', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-20', { minTemp: null, maxTemp: null, precipitationSum: null }),
    ]).findAll();
    expect(result).toEqual({ items: [], basedOnFetchedAt: FETCHED_AT });
  });

  it('R31: heute zählt mit, gestern nicht (US20-4)', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-18', { minTemp: -4 }),
      forecastDay('2026-11-19', { minTemp: -1 }),
    ]).findAll();
    expect(result.items.map(n => n.id)).toEqual(['2026-11-19-frost']);
  });

  it('R31 mit Berliner Kalendertag: 23:30 UTC am 18.11. ist schon der 19.11. (00:30 MEZ)', async () => {
    const result = await serviceWith(
      [forecastDay('2026-11-18', { minTemp: -4 }), forecastDay('2026-11-19', { minTemp: -1 })],
      '2026-11-18T23:30:00Z',
    ).findAll();
    expect(result.items.map(n => n.date)).toEqual(['2026-11-19']);
  });

  it('mehrere Hinweise: nach Datum, je Tag in der Reihenfolge der Schwellen; Werte auf eine Stelle gerundet', async () => {
    const result = await serviceWith([
      forecastDay('2026-11-22', { maxTemp: 31.25, minTemp: 20, precipitationSum: 24.04 }),
      forecastDay('2026-11-20', { minTemp: -3.25 }),
    ]).findAll();
    expect(result.items.map(n => [n.id, n.value])).toEqual([
      ['2026-11-20-frost', -3.3],
      ['2026-11-22-heat', 31.3],
      ['2026-11-22-heavy_rain', 24],
    ]);
  });

  it('Schwellen kommen aus der Tabelle: geänderter Wert gilt', async () => {
    const colder = THRESHOLDS.map(t => (t.type === 'frost' ? { ...t, value: -3 } : t));
    const result = await serviceWith([forecastDay('2026-11-20', { minTemp: -2.3 })], NOW, colder).findAll();
    expect(result.items).toEqual([]);
  });

  it('US20-3: ohne Vorhersage → items = [], basedOnFetchedAt = null', async () => {
    expect(await serviceWith(null).findAll()).toEqual({ items: [], basedOnFetchedAt: null });
  });

  it('Vorhersage ohne Schwellenwert → items = [], basedOnFetchedAt bleibt gesetzt', async () => {
    expect(await serviceWith([forecastDay('2026-11-20')]).findAll()).toEqual({ items: [], basedOnFetchedAt: FETCHED_AT });
  });
});
