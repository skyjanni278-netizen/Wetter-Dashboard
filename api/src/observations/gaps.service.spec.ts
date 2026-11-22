import { ApiValidationException } from '../common/api-validation.exception';
import { FixedClock } from '../common/clock';
import { GapsService } from './gaps.service';
import type { ObservationHour, StoredDay } from './observation';
import type { ObservationStore } from './observation.store';

const HOUR_MS = 60 * 60 * 1000;

/** Stunden ab `startUtc` mit Herkunft `forecast_api`; `edit` ändert oder entfernt (`null`) einzelne Stunden. */
function day(date: string, startUtc: string, count: number, edit: (i: number, h: ObservationHour) => ObservationHour | null = (_, h) => h): StoredDay {
  const hours: ObservationHour[] = [];
  for (let i = 0; i < count; i++) {
    const timeUtc = new Date(Date.parse(startUtc) + i * HOUR_MS).toISOString().replace('.000Z', 'Z');
    const hour: ObservationHour = {
      timeLocal: '',
      timeUtc,
      temperature: 5,
      apparentTemperature: 2,
      precipitation: 0,
      weatherCode: 3,
      windSpeed: 10,
      windDirection: 200,
      source: 'forecast_api',
    };
    const edited = edit(i, hour);
    if (edited) hours.push(edited);
  }
  return { date, hours };
}

function serviceWith(days: StoredDay[], now: string): GapsService {
  const store = { getRange: async () => days } as unknown as ObservationStore;
  return new GapsService(store, new FixedClock(now));
}

describe('GapsService (US12)', () => {
  it('US12-1: fehlende Stunden, null-Werte und veraltete Vorhersage als getrennte Lücken, aufeinanderfolgende zusammengefasst', async () => {
    // 12.11.2026 (MEZ, beginnt 11.11. 23:00Z): 04:00–06:00 fehlen, 09:00 Temperatur null, 10:00 Niederschlag null.
    const d12 = day('2026-11-12', '2026-11-11T23:00:00Z', 24, (i, h) =>
      i >= 4 && i <= 6 ? null : i === 9 ? { ...h, temperature: null } : i === 10 ? { ...h, precipitation: null } : h,
    );
    // 13.11.: 20:00–23:00 nur Vorhersage (Abruf um 19:05 MEZ, danach keiner mehr).
    const d13 = day('2026-11-13', '2026-11-12T23:00:00Z', 24, (i, h) => (i >= 20 ? { ...h, source: 'prediction' } : h));
    const service = serviceWith([d12, d13], '2026-11-19T13:30:00Z');

    expect((await service.find('2026-11-12', '2026-11-13')).items).toEqual([
      { id: '2026-11-12T03:00:00Z', from: '2026-11-12T04:00:00+01:00', to: '2026-11-12T06:00:00+01:00', hours: 3, reason: 'missing' },
      { id: '2026-11-12T08:00:00Z', from: '2026-11-12T09:00:00+01:00', to: '2026-11-12T10:00:00+01:00', hours: 2, reason: 'null_values' },
      { id: '2026-11-13T19:00:00Z', from: '2026-11-13T20:00:00+01:00', to: '2026-11-13T23:00:00+01:00', hours: 4, reason: 'stale_prediction' },
    ]);
  });

  it('ein Tag ohne jede Stunde ist eine Lücke über alle Stunden (25 am Ende der Sommerzeit, R07)', async () => {
    const { items } = await serviceWith([], '2026-11-19T13:30:00Z').find('2026-10-25', '2026-10-25');
    expect(items).toEqual([
      { id: '2026-10-24T22:00:00Z', from: '2026-10-25T00:00:00+02:00', to: '2026-10-25T23:00:00+01:00', hours: 25, reason: 'missing' },
    ]);
  });

  it('heute: nur abgeschlossene Stunden zählen; die laufende Stunde und Vorhersagen danach sind keine Lücke', async () => {
    // 19.11., jetzt 14:30 MEZ: 00–13 Uhr gemessen, ab 14:00 Uhr Vorhersage (Abruf 13:05 MEZ).
    const today = day('2026-11-19', '2026-11-18T23:00:00Z', 24, (i, h) => (i >= 14 ? { ...h, source: 'prediction' } : h));
    expect((await serviceWith([today], '2026-11-19T13:30:00Z').find('2026-11-19', '2026-11-19')).items).toEqual([]);
    // Um 15:00:00 MEZ ist 14:00 abgeschlossen; die Vorhersage für 14:00 ist dann veraltet.
    const later = await serviceWith([today], '2026-11-19T14:00:00Z').find('2026-11-19', '2026-11-19');
    expect(later.items).toEqual([
      { id: '2026-11-19T13:00:00Z', from: '2026-11-19T14:00:00+01:00', to: '2026-11-19T14:00:00+01:00', hours: 1, reason: 'stale_prediction' },
    ]);
  });

  it('vollständige Tage → items = []', async () => {
    const d = day('2026-11-10', '2026-11-09T23:00:00Z', 24);
    expect(await serviceWith([d], '2026-11-19T13:30:00Z').find('2026-11-10', '2026-11-10')).toEqual({ items: [] });
  });

  it('R02: to nach heute → 400 DATE_IN_FUTURE an to', async () => {
    const error: unknown = await serviceWith([], '2026-11-19T13:30:00Z')
      .find('2026-11-19', '2026-11-20')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiValidationException);
    expect((error as ApiValidationException).getResponse()).toMatchObject({ code: 'DATE_IN_FUTURE' });
    expect((error as ApiValidationException).errors).toEqual([expect.objectContaining({ field: 'to', code: 'too_big' })]);
  });
});
