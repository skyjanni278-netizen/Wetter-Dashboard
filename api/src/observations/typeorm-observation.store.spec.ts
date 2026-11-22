import type { DataSource } from 'typeorm';
import { providerHours } from '../../test/support/fakes';
import { insertImport, openTestDatabase, storedRow } from '../../test/support/database';
import { FixedClock } from '../common/clock';
import type { ObservationInput } from './observation';
import { Observation } from './observation.entity';
import { TypeOrmObservationStore, UPSERT_CHUNK_SIZE } from './typeorm-observation.store';

/** Stunden mit Herkunft `forecast_api`, wie sie der Runner übergibt. */
function hours(startUtc: string, count: number, valueOf?: Parameters<typeof providerHours>[2]): ObservationInput[] {
  return providerHours(startUtc, count, valueOf).map(h => ({ ...h, source: 'forecast_api' as const }));
}

describe('TypeOrmObservationStore (SQLite :memory:, Migrationen wie im Betrieb)', () => {
  let dataSource: DataSource;
  let store: TypeOrmObservationStore;
  let importId: number;
  const clock = new FixedClock('2026-11-20T12:00:00Z');

  beforeEach(async () => {
    clock.set('2026-11-20T12:00:00Z');
    dataSource = await openTestDatabase();
    store = new TypeOrmObservationStore(dataSource.getRepository(Observation), clock);
    importId = await insertImport(dataSource);
  });

  afterEach(() => dataSource.destroy());

  describe('Upsert-Zähler (03 B2.7 Schritt 8, R20)', () => {
    it('neu → inserted; gleicher Lauf noch einmal → unchanged (idempotent)', async () => {
      const day = hours('2026-11-09T23:00:00Z', 24);
      expect(await store.upsertHours(day, { mode: 'upsert', importId })).toEqual({
        inserted: 24,
        updated: 0,
        unchanged: 0,
        skippedCorrected: 0,
      });
      expect(await store.upsertHours(day, { mode: 'upsert', importId })).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 24,
        skippedCorrected: 0,
      });
    });

    it('geänderter Wert → updated, version + 1, updated_at = jetzt; null ist ein eigener Wert (R14)', async () => {
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 3), { mode: 'upsert', importId });
      const before = await storedRow(dataSource, '2026-11-10T00:00:00Z');
      expect(before).toMatchObject({ version: 1, updated_at: '2026-11-20T12:00:00Z', local_date: '2026-11-10', local_hour: 1 });

      clock.set('2026-11-20T13:00:00Z');
      const changed = hours('2026-11-09T23:00:00Z', 3, i => (i === 1 ? { temperature: 20.5 } : i === 2 ? { windSpeed: null } : {}));
      expect(await store.upsertHours(changed, { mode: 'upsert', importId })).toEqual({
        inserted: 0,
        updated: 2,
        unchanged: 1,
        skippedCorrected: 0,
      });
      const after = await storedRow(dataSource, '2026-11-10T00:00:00Z');
      expect(after).toMatchObject({ temperature: 20.5, version: 2, updated_at: '2026-11-20T13:00:00Z', fetched_at: '2026-11-20T13:00:00Z' });
      expect((await storedRow(dataSource, '2026-11-09T23:00:00Z'))?.version).toBe(1);
    });

    it('R20: korrigierte Stunde bleibt, Zähler skippedCorrected; gleiche Werte zählen als unchanged', async () => {
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 2), { mode: 'upsert', importId });
      await dataSource.query(`UPDATE "observation" SET "corrected_at" = '2026-11-20T11:00:00Z', "temperature" = 9.9`);

      const counts = await store.upsertHours(hours('2026-11-09T23:00:00Z', 2, i => (i === 0 ? { temperature: 9.9 } : {})), {
        mode: 'upsert',
        importId,
      });

      expect(counts).toEqual({ inserted: 0, updated: 0, unchanged: 1, skippedCorrected: 1 });
      expect(await storedRow(dataSource, '2026-11-10T00:00:00Z')).toMatchObject({ temperature: 9.9, version: 1 });
    });

    it('R08: Stunde nach dem Schreibzeitpunkt → prediction; später als Messwert → updated, auch mit gleichen Werten', async () => {
      const today = hours('2026-11-20T11:00:00Z', 3); // 11:00Z vergangen, 12:00Z = jetzt (vergangen), 13:00Z Zukunft
      await store.upsertHours(today, { mode: 'upsert', importId });
      expect((await storedRow(dataSource, '2026-11-20T12:00:00Z'))?.source).toBe('forecast_api');
      expect((await storedRow(dataSource, '2026-11-20T13:00:00Z'))?.source).toBe('prediction');

      clock.set('2026-11-20T14:05:00Z');
      expect(await store.upsertHours(today, { mode: 'upsert', importId })).toEqual({
        inserted: 0,
        updated: 1,
        unchanged: 2,
        skippedCorrected: 0,
      });
      expect(await storedRow(dataSource, '2026-11-20T13:00:00Z')).toMatchObject({ source: 'forecast_api', version: 2 });
    });

    it('fetchedAt je Stunde (Altdatenimport, B2.7 Schritt 6): fetched_at und R08-Grenze, updated_at bleibt jetzt', async () => {
      const fetchedAt = '2026-11-19T21:04:32Z';
      const day = hours('2026-11-19T20:00:00Z', 3).map(h => ({ ...h, fetchedAt }));
      await store.upsertHours(day, { mode: 'upsert', importId });
      expect(await storedRow(dataSource, '2026-11-19T21:00:00Z')).toMatchObject({
        source: 'forecast_api',
        fetched_at: fetchedAt,
        updated_at: '2026-11-20T12:00:00Z',
      });
      // 22:00Z liegt nach dem Abruf (21:04:32Z), obwohl die Stunde beim Schreiben schon vorbei ist.
      expect(await storedRow(dataSource, '2026-11-19T22:00:00Z')).toMatchObject({ source: 'prediction', fetched_at: fetchedAt });

      // Zweiter Lauf später: gleicher Abrufzeitpunkt → nichts ändert sich (idempotent, US15-3).
      clock.set('2026-11-22T08:00:00Z');
      expect(await store.upsertHours(day, { mode: 'upsert', importId })).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
      await expect(store.upsertHours([{ ...day[0], fetchedAt: 'gestern' }], { mode: 'upsert', importId })).rejects.toThrow(
        /ungültigem Abrufzeitpunkt/,
      );
    });

    it('gaps (insertMissing): nur fehlende Stunden, veraltete Vorhersagen und null-Lücken; sonst unchanged', async () => {
      clock.set('2026-11-10T03:30:00Z');
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 6, i => (i === 1 ? { temperature: null } : {})), {
        mode: 'upsert',
        importId,
      }); // 23,00,01,02,03 vergangen; 04:00Z prediction; 00:00Z temperature null

      clock.set('2026-11-20T12:00:00Z');
      const incoming = hours('2026-11-09T23:00:00Z', 8, i => (i === 2 ? { temperature: 1.5 } : {}));
      const counts = await store.upsertHours(incoming, { mode: 'insertMissing', importId });

      // 05:00Z und 06:00Z neu; 04:00Z (veraltete Vorhersage) und 00:00Z (null) ersetzt; 01:00Z mit anderem Wert bleibt.
      expect(counts).toEqual({ inserted: 2, updated: 2, unchanged: 4, skippedCorrected: 0 });
      expect((await storedRow(dataSource, '2026-11-10T04:00:00Z'))?.source).toBe('forecast_api');
      expect((await storedRow(dataSource, '2026-11-10T00:00:00Z'))?.temperature).not.toBeNull();
      expect((await storedRow(dataSource, '2026-11-10T01:00:00Z'))?.temperature).not.toBe(1.5);
    });

    it(`Blöcke zu ${UPSERT_CHUNK_SIZE} Zeilen: 1.200 Stunden in einem Aufruf, doppelte Zeitpunkte nur einmal`, async () => {
      const many = hours('2026-01-01T00:00:00Z', 1200, i => ({ temperature: (i % 200) / 10 }));
      const counts = await store.upsertHours([...many, many[0]], { mode: 'upsert', importId });
      expect(counts).toEqual({ inserted: 1200, updated: 0, unchanged: 0, skippedCorrected: 0 });
      const [row]: { n: number }[] = await dataSource.query('SELECT COUNT(*) AS "n" FROM "observation"');
      expect(row.n).toBe(1200);
    });

    it('alles oder nichts: ein CHECK-Verstoß im zweiten Block lässt auch den ersten Block ungeschrieben', async () => {
      const many = hours('2026-01-01T00:00:00Z', 600, i => ({ temperature: i === 550 ? 51 : 5 }));
      await expect(store.upsertHours(many, { mode: 'upsert', importId })).rejects.toThrow(/CHECK constraint failed/);
      const [row]: { n: number }[] = await dataSource.query('SELECT COUNT(*) AS "n" FROM "observation"');
      expect(row.n).toBe(0);
    });

    it('ohne Herkunft (source) → Fehler statt einer Zeile ohne Pflichtfeld', async () => {
      const [hour] = providerHours('2026-11-10T00:00:00Z', 1);
      await expect(store.upsertHours([hour], { mode: 'upsert', importId })).rejects.toThrow(/ohne Herkunft/);
    });
  });

  describe('Lesen', () => {
    it('getRange gruppiert nach local_date (Berlin); 25.10.2026 hat 25 Stunden, 02:00 doppelt', async () => {
      await store.upsertHours(hours('2026-10-23T22:00:00Z', 24 + 25), { mode: 'upsert', importId });
      const days = await store.getRange('2026-10-24', '2026-10-25');
      expect(days.map(d => [d.date, d.hours.length])).toEqual([
        ['2026-10-24', 24],
        ['2026-10-25', 25],
      ]);
      const twoAm = days[1].hours.filter(h => h.timeLocal === '2026-10-25T02:00');
      expect(twoAm.map(h => h.timeUtc)).toEqual(['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z']);
      expect(await storedRow(dataSource, '2026-10-25T00:00:00Z')).toMatchObject({ utc_offset_min: 120, local_hour: 2 });
      expect(await storedRow(dataSource, '2026-10-25T01:00:00Z')).toMatchObject({ utc_offset_min: 60, local_hour: 2 });
    });

    it('getDay, getDataRange und leere Datenbank', async () => {
      expect(await store.getDay('2026-11-10')).toBeNull();
      expect(await store.getDataRange()).toEqual({ from: null, to: null });
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 48), { mode: 'upsert', importId });
      expect(await store.getDataRange()).toEqual({ from: '2026-11-10', to: '2026-11-11' });
      const day = await store.getDay('2026-11-10');
      expect(day?.[0]).toMatchObject({ timeLocal: '2026-11-10T00:00', timeUtc: '2026-11-09T23:00:00Z', source: 'forecast_api' });
    });
  });

  describe('Datenrevision (B2.4)', () => {
    it('ändert sich mit jedem Insert und Update, auch bei stehender Uhr; nicht bei unveränderten Werten', async () => {
      const empty = await store.getRevision();
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 2), { mode: 'upsert', importId });
      const afterInsert = await store.getRevision();
      expect(afterInsert).not.toBe(empty);

      await store.upsertHours(hours('2026-11-09T23:00:00Z', 2), { mode: 'upsert', importId });
      expect(await store.getRevision()).toBe(afterInsert);

      // Gleiche Sekunde, gleiche Zeilenzahl: nur SUM(version) unterscheidet.
      await store.upsertHours(hours('2026-11-09T23:00:00Z', 1, () => ({ temperature: 3 })), { mode: 'upsert', importId });
      expect(await store.getRevision()).not.toBe(afterInsert);
    });
  });
});
