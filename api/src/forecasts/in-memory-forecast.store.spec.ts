import { FakeLegacySource, forecastDays } from '../../test/support/fakes';
import { InMemoryForecastStore } from './in-memory-forecast.store';

describe('InMemoryForecastStore', () => {
  it('ohne Datei und Import → null', async () => {
    expect(await new InMemoryForecastStore(new FakeLegacySource().asSource()).getLatest()).toBeNull();
  });

  it('liefert die jüngere Vorhersage (Datei oder Import)', async () => {
    const legacy = new FakeLegacySource();
    legacy.forecast = { days: forecastDays('2026-11-19'), fetchedAt: '2026-11-19T13:05:12.345Z' };
    const store = new InMemoryForecastStore(legacy.asSource());
    expect(await store.getLatest()).toMatchObject({ importId: null, fetchedAt: '2026-11-19T13:05:12.345Z' });

    await store.save({ days: forecastDays('2026-11-20'), fetchedAt: '2026-11-19T14:00:00Z', importId: 3 });
    expect(await store.getLatest()).toMatchObject({ importId: 3, fetchedAt: '2026-11-19T14:00:00Z' });

    // Express schreibt forecast.json danach neu → die Datei ist wieder jünger.
    legacy.forecast = { days: forecastDays('2026-11-20'), fetchedAt: '2026-11-19T15:00:00.000Z' };
    expect(await store.getLatest()).toMatchObject({ importId: null });
  });
});
