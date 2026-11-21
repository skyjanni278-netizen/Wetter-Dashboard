import type { DataSource } from 'typeorm';
import { forecastDays } from '../../test/support/fakes';
import { insertImport, openTestDatabase } from '../../test/support/database';
import { DailyForecast } from './daily-forecast.entity';
import { TypeOrmForecastStore } from './typeorm-forecast.store';

describe('TypeOrmForecastStore (SQLite :memory:)', () => {
  let dataSource: DataSource;
  let store: TypeOrmForecastStore;

  beforeEach(async () => {
    dataSource = await openTestDatabase();
    store = new TypeOrmForecastStore(dataSource.getRepository(DailyForecast));
  });

  afterEach(() => dataSource.destroy());

  it('ohne Vorhersage → null; sonst die Tage des jüngsten Abrufs, ein neuer Abruf überschreibt seine Tage', async () => {
    expect(await store.getLatest()).toBeNull();
    const first = await insertImport(dataSource);
    await store.save({ days: forecastDays('2026-11-19'), fetchedAt: '2026-11-19T12:05:00Z', importId: first });

    const second = await insertImport(dataSource);
    const days = forecastDays('2026-11-20').map(d => ({ ...d, maxTemp: 4.2 }));
    await store.save({ days, fetchedAt: '2026-11-20T12:05:00Z', importId: second });

    const latest = await store.getLatest();
    expect(latest).toMatchObject({ fetchedAt: '2026-11-20T12:05:00Z', importId: second });
    expect(latest?.days.map(d => d.date)).toEqual(days.map(d => d.date));
    expect(latest?.days[0]).toEqual({ date: '2026-11-20', maxTemp: 4.2, minTemp: 2.1, precipitationSum: 1.2, weatherCode: 61 });
    const [row]: { n: number }[] = await dataSource.query('SELECT COUNT(*) AS "n" FROM "daily_forecast"');
    expect(row.n).toBe(8); // 19.11. aus dem ersten Abruf bleibt, 20.–26.11. aus dem zweiten
  });

  it('CHECK: min_temp > max_temp wird abgewiesen (B2.6)', async () => {
    const days = forecastDays('2026-11-20', 1).map(d => ({ ...d, minTemp: 9, maxTemp: 1 }));
    await expect(store.save({ days, fetchedAt: '2026-11-20T12:05:00Z', importId: null })).rejects.toThrow(/CHECK constraint failed/);
  });
});
