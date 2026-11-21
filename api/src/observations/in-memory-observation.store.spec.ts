import { FakeLegacySource, legacyDay, providerHours } from '../../test/support/fakes';
import { FixedClock } from '../common/clock';
import { InMemoryObservationStore } from './in-memory-observation.store';

/** 20.11.2026, 11:00 MEZ: „heute“ ist der 20.11. */
function setup() {
  const legacy = new FakeLegacySource();
  const clock = new FixedClock('2026-11-20T10:00:00Z');
  const store = new InMemoryObservationStore(legacy.asSource(), clock);
  return { legacy, clock, store };
}

const ONE_HOUR_TODAY = () => providerHours('2026-11-19T23:00:00Z', 1, () => ({ temperature: 7 }));

describe('InMemoryObservationStore', () => {
  it('liefert den Altbestand mit timeUtc null; unbekannter Tag → null', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-11-10', legacyDay('2026-11-10'));
    const day = await store.getDay('2026-11-10');
    expect(day).toHaveLength(24);
    expect(day?.[0]).toMatchObject({ timeLocal: '2026-11-10T00:00', timeUtc: null, temperature: 10 });
    expect(await store.getDay('2026-11-11')).toBeNull();
  });

  it('liest bei jeder Anfrage über die Quelle (heutige Datei neu lesen bleibt erhalten)', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 1 })));
    expect((await store.getDay('2026-11-20'))?.[0].temperature).toBe(1);
    legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 2 })));
    expect((await store.getDay('2026-11-20'))?.[0].temperature).toBe(2);
  });

  it('upsert: ordnet UTC-Stunden dem Berliner Tag zu und zählt inserted/updated/unchanged', async () => {
    const { legacy, store } = setup();
    // 20.11. (MEZ) = UTC 19.11. 23:00 bis 20.11. 22:59
    const hours = providerHours('2026-11-19T23:00:00Z', 24);
    legacy.days.set(
      '2026-11-20',
      legacyDay('2026-11-20', h => (h < 12 ? { temperature: hours[h].temperature } : { temperature: 99 })),
    );

    const counts = await store.upsertHours(hours, { mode: 'upsert', importId: 1 });

    expect(counts).toEqual({ inserted: 0, updated: 12, unchanged: 12, skippedCorrected: 0 });
    const day = await store.getDay('2026-11-20');
    expect(day).toHaveLength(24);
    expect(day?.[0]).toMatchObject({ timeLocal: '2026-11-20T00:00', timeUtc: null });
    expect(day?.[12]).toMatchObject({ timeLocal: '2026-11-20T12:00', timeUtc: '2026-11-20T11:00:00Z' });
    expect(day?.[12].temperature).toBe(hours[12].temperature);

    // Zweiter Lauf mit denselben Werten ändert nichts (idempotent).
    expect(await store.upsertHours(hours, { mode: 'upsert', importId: 2 })).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 24,
      skippedCorrected: 0,
    });
  });

  describe('Vorrang für heute: die neuere Quelle gewinnt', () => {
    it('Import neuer als die heutige Datei → importierte Stunden gelten', async () => {
      const { legacy, store } = setup();
      legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 1 })));
      legacy.modifiedAt.set('2026-11-20', '2026-11-20T09:00:05Z'); // Express-Lauf 10:00 MEZ
      await store.upsertHours(ONE_HOUR_TODAY(), { mode: 'upsert', importId: 1 }); // Import 11:00 MEZ

      const day = await store.getDay('2026-11-20');
      expect(day?.[0]).toMatchObject({ temperature: 7, timeUtc: '2026-11-19T23:00:00Z' });
      expect(day?.[1].temperature).toBe(1);
    });

    it('Datei neuer als der Import → nur die Datei gilt, der Import friert sie nicht ein', async () => {
      const { legacy, clock, store } = setup();
      legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 1 })));
      legacy.modifiedAt.set('2026-11-20', '2026-11-20T09:00:05Z');
      await store.upsertHours(ONE_HOUR_TODAY(), { mode: 'upsert', importId: 1 }); // 10:00:00Z

      // Express schreibt um 12:00 MEZ die Datei neu.
      clock.set('2026-11-20T11:00:10Z');
      legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 2 })));
      legacy.modifiedAt.set('2026-11-20', '2026-11-20T11:00:05Z');

      const day = await store.getDay('2026-11-20');
      expect(day).toHaveLength(24);
      expect(day?.[0]).toMatchObject({ temperature: 2, timeUtc: null });

      // Ein späterer Import vergleicht gegen die Datei; der überholte Import taucht nicht wieder auf.
      clock.set('2026-11-20T11:30:00Z');
      const counts = await store.upsertHours(
        providerHours('2026-11-20T00:00:00Z', 1, () => ({ temperature: 3 })),
        { mode: 'upsert', importId: 2 },
      );
      expect(counts).toEqual({ inserted: 0, updated: 1, unchanged: 0, skippedCorrected: 0 });
      const after = await store.getDay('2026-11-20');
      expect(after?.[0].temperature).toBe(2);
      expect(after?.[1].temperature).toBe(3);
    });

    it('ältere Tage: Import hat Vorrang, auch wenn eine Änderungszeit neuer ist', async () => {
      const { legacy, store } = setup();
      legacy.days.set('2026-11-19', legacyDay('2026-11-19', () => ({ temperature: 1 })));
      await store.upsertHours(providerHours('2026-11-18T23:00:00Z', 1, () => ({ temperature: 7 })), {
        mode: 'upsert',
        importId: 1,
      });
      legacy.modifiedAt.set('2026-11-19', '2026-11-20T09:59:59Z');
      expect((await store.getDay('2026-11-19'))?.[0].temperature).toBe(7);
    });
  });

  it('25.10.2026: 25 Stunden, die doppelte 02:00 (MEZ) kommt hinzu', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-10-25', legacyDay('2026-10-25'));
    // 25.10. 00:00 MESZ = 24.10. 22:00Z; der Tag endet 25.10. 23:00Z (25 Stunden)
    const hours = providerHours('2026-10-24T22:00:00Z', 25);

    const counts = await store.upsertHours(hours, { mode: 'upsert', importId: 1 });

    // 00:00–02:00 (MESZ) gleich dem Altbestand, 02:00 MEZ neu, ab 03:00 um eine Stunde versetzte Werte.
    expect(counts).toEqual({ inserted: 1, updated: 21, unchanged: 3, skippedCorrected: 0 });
    const day = await store.getDay('2026-10-25');
    expect(day).toHaveLength(25);
    expect(day?.filter(h => h.timeLocal === '2026-10-25T02:00').map(h => h.timeUtc)).toEqual([
      null,
      '2026-10-25T01:00:00Z',
    ]);
  });

  it('insertMissing (gaps) legt nur fehlende Stunden an', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-11-20', legacyDay('2026-11-20', () => ({ temperature: 99 })).slice(0, 20));
    const counts = await store.upsertHours(providerHours('2026-11-19T23:00:00Z', 24), {
      mode: 'insertMissing',
      importId: 1,
    });
    expect(counts).toEqual({ inserted: 4, updated: 0, unchanged: 20, skippedCorrected: 0 });
    const day = await store.getDay('2026-11-20');
    expect(day).toHaveLength(24);
    expect(day?.[0].temperature).toBe(99);
  });

  it('neue Tage erweitern den Datenzeitraum', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-11-10', legacyDay('2026-11-10'));
    expect(await store.getDataRange()).toEqual({ from: '2026-11-10', to: '2026-11-10' });
    await store.upsertHours(providerHours('2024-12-31T23:00:00Z', 1), { mode: 'upsert', importId: 1 });
    expect(await store.getDataRange()).toEqual({ from: '2025-01-01', to: '2026-11-10' });
  });

  it('getRange liefert nur Tage mit Stunden, aufsteigend, Grenzen eingeschlossen', async () => {
    const { legacy, store } = setup();
    legacy.days.set('2026-11-10', legacyDay('2026-11-10'));
    legacy.days.set('2026-11-12', legacyDay('2026-11-12'));
    legacy.days.set('2026-11-14', legacyDay('2026-11-14'));
    const days = await store.getRange('2026-11-10', '2026-11-13');
    expect(days.map(d => d.date)).toEqual(['2026-11-10', '2026-11-12']);
    expect(days[0].hours).toHaveLength(24);
    expect(await store.getRange('2026-11-15', '2026-11-14')).toEqual([]);
  });

  describe('R08: Herkunft und Vorhersage', () => {
    it('Altbestand: Stunden nach der Änderungszeit der Datei sind Vorhersage (Befund Z3), sonst Herkunft null', async () => {
      const { legacy, store } = setup();
      legacy.days.set('2026-11-19', legacyDay('2026-11-19'));
      legacy.modifiedAt.set('2026-11-19', '2026-11-19T21:04:32Z'); // 22:04 MEZ
      const day = await store.getDay('2026-11-19');
      expect(day?.[22].source).toBeNull();
      expect(day?.[23]).toMatchObject({ timeLocal: '2026-11-19T23:00', source: 'prediction' });
    });

    it('Import: Stunden nach dem Abruf werden als prediction gespeichert, sonst mit der abgefragten API', async () => {
      const { store } = setup(); // jetzt 11:00 MEZ
      const hours = providerHours('2026-11-19T23:00:00Z', 24).map(h => ({ ...h, source: 'forecast_api' as const }));
      await store.upsertHours(hours, { mode: 'upsert', importId: 1 });
      const day = await store.getDay('2026-11-20');
      expect(day?.[11]).toMatchObject({ timeLocal: '2026-11-20T11:00', source: 'forecast_api' });
      expect(day?.[12]).toMatchObject({ timeLocal: '2026-11-20T12:00', source: 'prediction' });
    });

    it('eine veraltete Vorhersage wird ersetzt, auch bei gleichen Werten und auch von gaps', async () => {
      const { clock, store } = setup();
      const hours = providerHours('2026-11-19T23:00:00Z', 24).map(h => ({ ...h, source: 'forecast_api' as const }));
      await store.upsertHours(hours, { mode: 'upsert', importId: 1 }); // 12:00–23:00 prediction
      clock.set('2026-11-21T10:00:00Z');
      const counts = await store.upsertHours(hours, { mode: 'insertMissing', importId: 2 });
      expect(counts).toEqual({ inserted: 0, updated: 12, unchanged: 12, skippedCorrected: 0 });
      expect((await store.getDay('2026-11-20'))?.every(h => h.source === 'forecast_api')).toBe(true);
    });
  });

  it('mit Fixture: Stunden der Fixture statt des Altbestands, Datenbereich nur aus der Fixture', async () => {
    const legacy = new FakeLegacySource();
    legacy.days.set('2025-01-01', legacyDay('2025-01-01'));
    const fixture = {
      name: 'test',
      description: '',
      fakeNow: null,
      observations: providerHours('2026-03-28T23:00:00Z', 23).map(h => ({ ...h, source: 'archive' as const })),
      imports: [],
      forecast: null,
    };
    const store = new InMemoryObservationStore(legacy.asSource(), new FixedClock('2026-11-19T13:30:00Z'), fixture);
    expect(await store.getDay('2025-01-01')).toBeNull();
    const day = await store.getDay('2026-03-29');
    expect(day).toHaveLength(23);
    expect(day?.[2]).toMatchObject({ timeLocal: '2026-03-29T03:00', timeUtc: '2026-03-29T01:00:00Z', source: 'archive' });
    expect(await store.getDataRange()).toEqual({ from: '2026-03-29', to: '2026-03-29' });
  });
});
