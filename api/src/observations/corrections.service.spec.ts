import type { DataSource } from 'typeorm';
import { providerHours } from '../../test/support/fakes';
import { insertImport, openTestDatabase, storedRow } from '../../test/support/database';
import { ApiException } from '../common/api.exception';
import { FixedClock } from '../common/clock';
import { CorrectionsService } from './corrections.service';
import type { ObservationPatch } from './dto/observation-patch.schema';
import { Observation } from './observation.entity';
import { TypeOrmObservationStore } from './typeorm-observation.store';

const NOW = '2026-11-19T13:30:00Z'; // 14:30 MEZ
const ADMIN = 1;

/** 18.11. 14:00 MEZ (vergangen), 19.11. 14:00 MEZ (aktuelle volle Stunde), 19.11. 15:00 MEZ (Zukunft). */
const PAST = '2026-11-18T13:00:00Z';
const CURRENT = '2026-11-19T13:00:00Z';
const FUTURE = '2026-11-19T14:00:00Z';

async function apiError(promise: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return { status: error.getStatus(), code: error.payload.code, message: error.payload.message };
    throw error;
  }
  throw new Error('kein Fehler');
}

describe('CorrectionsService (N03: R08, R16, R17, R20, R33; SQLite :memory:)', () => {
  let dataSource: DataSource;
  let store: TypeOrmObservationStore;
  let service: CorrectionsService;
  let importId: number;
  const clock = new FixedClock(NOW);

  /** id der Stunde `timeUtc`. */
  const idOf = async (timeUtc: string) => (await storedRow(dataSource, timeUtc) as unknown as { id: number }).id;
  const corrections = () => dataSource.query(`SELECT * FROM "correction" ORDER BY "id"`) as Promise<Record<string, unknown>[]>;
  const patch = (values: Omit<ObservationPatch, 'reason'>, reason = 'Ausreißer, Nachbarstunden 9,4/9,8 °C'): ObservationPatch => ({
    ...values,
    reason,
  });

  beforeEach(async () => {
    clock.set(NOW);
    dataSource = await openTestDatabase();
    await dataSource.query(
      `INSERT INTO "user" ("id", "username", "password_hash", "is_active", "created_at") VALUES (?, 'admin', 'x', 1, '2026-11-19T09:00:00Z')`,
      [ADMIN],
    );
    importId = await insertImport(dataSource);
    store = new TypeOrmObservationStore(dataSource.getRepository(Observation), clock);
    // 18.11. 00:00 MEZ bis 19.11. 23:00 MEZ; ab 15:00 MEZ am 19.11. Vorhersage (R08 beim Schreiben).
    const hours = providerHours('2026-11-17T23:00:00Z', 48, i => ({ temperature: i === 14 ? 19.6 : 9 }));
    await store.upsertHours(
      hours.map(h => ({ ...h, source: 'forecast_api' as const })),
      { mode: 'upsert', importId },
    );
    service = new CorrectionsService(dataSource, clock);
  });

  afterEach(() => dataSource.destroy());

  describe('findObservation (US13-1)', () => {
    it('Ressource nach B2.2 mit Ortszeit und Offset, ungerundet; unbekannt → 404', async () => {
      const id = await idOf(PAST);
      expect(await service.findObservation(id)).toEqual({
        id,
        locationId: 1,
        timeUtc: PAST,
        timeLocal: '2026-11-18T14:00:00+01:00',
        localDate: '2026-11-18',
        temperature: 19.6,
        apparentTemperature: expect.any(Number),
        precipitation: expect.any(Number),
        weatherCode: expect.any(Number),
        windSpeed: expect.any(Number),
        windDirection: expect.any(Number),
        source: 'forecast_api',
        isPrediction: false,
        importId,
        fetchedAt: NOW,
        correctedAt: null,
        version: 1,
      });
      expect((await service.findObservation(await idOf(FUTURE))).isPrediction).toBe(true);
      expect(await apiError(service.findObservation(99_999))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });

  describe('correct (PATCH, US13-2 bis -8)', () => {
    it('US13-2: Version n → n + 1, corrected_at/updated_at = jetzt, ein Eintrag je geändertem Feld in einer Transaktion', async () => {
      const id = await idOf(PAST);
      clock.set('2026-11-19T13:20:00Z');
      const result = await service.correct(id, [1], patch({ temperature: 9.6, windSpeed: null, precipitation: undefined }), ADMIN);
      expect(result).toMatchObject({ id, temperature: 9.6, windSpeed: null, version: 2, correctedAt: '2026-11-19T13:20:00Z' });
      expect(await storedRow(dataSource, PAST)).toMatchObject({
        version: 2,
        corrected_at: '2026-11-19T13:20:00Z',
        updated_at: '2026-11-19T13:20:00Z',
      });
      expect(await corrections()).toEqual([
        expect.objectContaining({ observation_id: id, field: 'temperature', old_value: 19.6, new_value: 9.6, corrected_by: ADMIN, reverts_correction_id: null }),
        expect.objectContaining({ observation_id: id, field: 'wind_speed', new_value: null, corrected_at: '2026-11-19T13:20:00Z' }),
      ]);
      expect((await service.history(id)).items.map(e => e.field)).toEqual(['windSpeed', 'temperature']);
    });

    it('unveränderter Wert: keine neue Version, kein Eintrag (die Versionsprüfung gilt trotzdem)', async () => {
      const id = await idOf(PAST);
      expect(await service.correct(id, [1], patch({ temperature: 19.6 }), ADMIN)).toMatchObject({ version: 1, correctedAt: null });
      expect(await corrections()).toEqual([]);
      expect(await apiError(service.correct(id, [7], patch({ temperature: 19.6 }), ADMIN))).toMatchObject({ status: 412 });
    });

    it('R17 (US13-4): veraltete Version → 412 PRECONDITION_FAILED, nichts geschrieben; eine Liste mit der aktuellen passt', async () => {
      const id = await idOf(PAST);
      await service.correct(id, [1], patch({ temperature: 9.6 }), ADMIN);
      const stale = await apiError(service.correct(id, [1], patch({ temperature: 8 }), ADMIN));
      expect(stale).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
      expect(stale.message).toContain('Version 2');
      expect(await storedRow(dataSource, PAST)).toMatchObject({ temperature: 9.6, version: 2 });
      expect(await corrections()).toHaveLength(1);
      expect(await service.correct(id, [1, 2], patch({ temperature: 8 }), ADMIN)).toMatchObject({ version: 3 });
      expect(await apiError(service.correct(id, [], patch({ temperature: 7 }), ADMIN))).toMatchObject({ status: 412 });
    });

    it('R08 (US13-8): gespeicherte Vorhersage oder Stunde nach „jetzt“ → 409 OBSERVATION_IS_PREDICTION; die aktuelle volle Stunde nicht', async () => {
      expect(await apiError(service.correct(await idOf(FUTURE), [1], patch({ temperature: 5 }), ADMIN))).toMatchObject({
        status: 409,
        code: 'OBSERVATION_IS_PREDICTION',
      });
      // Eine veraltete Vorhersage (source = prediction, Zeit vorbei) bleibt eine Vorhersage.
      clock.set('2026-11-19T16:30:00Z');
      expect(await apiError(service.correct(await idOf(FUTURE), [1], patch({ temperature: 5 }), ADMIN))).toMatchObject({ status: 409 });
      clock.set(NOW);
      expect(await service.correct(await idOf(CURRENT), [1], patch({ temperature: 5 }), ADMIN)).toMatchObject({ version: 2 });
    });

    it('Transaktion: scheitert ein Eintrag in correction (Konto unbekannt, FK), bleibt die Stunde unverändert → 401', async () => {
      const id = await idOf(PAST);
      expect(await apiError(service.correct(id, [1], patch({ temperature: 9.6, windSpeed: 3 }), 99))).toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(await storedRow(dataSource, PAST)).toMatchObject({ temperature: 19.6, version: 1, corrected_at: null });
      expect(await corrections()).toEqual([]);
    });

    it('unbekannte Stunde → 404 (vor der Versionsprüfung)', async () => {
      expect(await apiError(service.correct(99_999, [1], patch({ temperature: 1 }), ADMIN))).toMatchObject({ status: 404 });
    });
  });

  describe('R20 nach einer Korrektur', () => {
    it('Import ohne overwriteCorrections → skippedCorrected; mit → überschrieben, corrected_at NULL, Historie bleibt', async () => {
      const id = await idOf(PAST);
      await service.correct(id, [1], patch({ temperature: 9.6 }), ADMIN);
      const input = providerHours(PAST, 1, () => ({ temperature: 4.2 })).map(h => ({ ...h, source: 'forecast_api' as const }));
      expect(await store.upsertHours(input, { mode: 'upsert', importId })).toMatchObject({ skippedCorrected: 1 });
      expect(await storedRow(dataSource, PAST)).toMatchObject({ temperature: 9.6, version: 2 });

      expect(await store.upsertHours(input, { mode: 'upsert', importId, overwriteCorrections: true })).toMatchObject({ updated: 1 });
      expect(await storedRow(dataSource, PAST)).toMatchObject({ temperature: 4.2, corrected_at: null, version: 3 });
      expect((await service.history(id)).items).toHaveLength(1);
    });
  });

  describe('revert (R33, US13-16 bis -18)', () => {
    async function corrected() {
      const id = await idOf(PAST);
      clock.set('2026-11-19T13:20:00Z');
      await service.correct(id, [1], patch({ temperature: 9.6 }), ADMIN);
      const [entry] = (await service.history(id)).items;
      clock.set('2026-11-19T13:25:00Z');
      return { id, correctionId: entry.id };
    }

    it('US13-16: Wert = oldValue, Eintrag mit revertsCorrectionId, version + 1, updated_at neu, corrected_at = NULL', async () => {
      const { id, correctionId } = await corrected();
      const result = await service.revert(id, correctionId, [2], 'Rücknahme: Wert war plausibel', ADMIN);
      expect(result).toMatchObject({ temperature: 19.6, version: 3, correctedAt: null });
      expect(await storedRow(dataSource, PAST)).toMatchObject({ updated_at: '2026-11-19T13:25:00Z', corrected_at: null });
      const history = (await service.history(id)).items;
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        field: 'temperature',
        oldValue: 9.6,
        newValue: 19.6,
        revertsCorrectionId: correctionId,
        reason: 'Rücknahme: Wert war plausibel',
        correctedBy: ADMIN,
        correctedAt: '2026-11-19T13:25:00Z',
      });
      // R20: Ohne wirksame Korrektur darf ein Import die Stunde wieder aktualisieren.
      const input = providerHours(PAST, 1, () => ({ temperature: 4.2 })).map(h => ({ ...h, source: 'forecast_api' as const }));
      expect(await store.upsertHours(input, { mode: 'upsert', importId })).toMatchObject({ updated: 1, skippedCorrected: 0 });
    });

    it('US13-17: dieselbe Rücknahme ein zweites Mal / die Rücknahme selbst → 409 CORRECTION_NOT_REVERSIBLE', async () => {
      const { id, correctionId } = await corrected();
      await service.revert(id, correctionId, [2], 'Rücknahme: Wert war plausibel', ADMIN);
      const again = await apiError(service.revert(id, correctionId, [3], 'noch einmal', ADMIN));
      expect(again).toMatchObject({ status: 409, code: 'CORRECTION_NOT_REVERSIBLE' });
      expect(again.message).toContain('schon zurückgenommen');
      const reversalId = (await service.history(id)).items[0].id;
      const ofReversal = await apiError(service.revert(id, reversalId, [3], 'Rücknahme der Rücknahme', ADMIN));
      expect(ofReversal).toMatchObject({ status: 409, code: 'CORRECTION_NOT_REVERSIBLE' });
      expect(ofReversal.message).toContain('selbst eine Rücknahme');
      expect(await storedRow(dataSource, PAST)).toMatchObject({ temperature: 19.6, version: 3 });
    });

    it('US13-17: nach einer weiteren Korrektur desselben Felds → 409; nach deren Rücknahme ist die erste wieder rücknehmbar', async () => {
      const { id, correctionId } = await corrected();
      await service.correct(id, [2], patch({ temperature: 8 }), ADMIN);
      const second = (await service.history(id)).items[0].id;
      const blocked = await apiError(service.revert(id, correctionId, [3], 'zu früh', ADMIN));
      expect(blocked).toMatchObject({ status: 409, code: 'CORRECTION_NOT_REVERSIBLE' });
      expect(blocked.message).toContain('noch einmal korrigiert');

      // Die jüngere zurücknehmen: Wert wieder 9,6, die erste Korrektur bleibt wirksam (corrected_at bleibt, R33).
      expect(await service.revert(id, second, [3], 'zweite war falsch', ADMIN)).toMatchObject({
        temperature: 9.6,
        version: 4,
        correctedAt: '2026-11-19T13:25:00Z',
      });
      expect(await service.revert(id, correctionId, [4], 'erste auch', ADMIN)).toMatchObject({ temperature: 19.6, correctedAt: null });
    });

    it('zwei Felder korrigiert, eines zurückgenommen → corrected_at bleibt gesetzt', async () => {
      const id = await idOf(PAST);
      await service.correct(id, [1], patch({ temperature: 9.6, windDirection: 180 }), ADMIN);
      const temperature = (await service.history(id)).items.find(e => e.field === 'temperature')!;
      expect(await service.revert(id, temperature.id, [2], 'nur Temperatur zurück', ADMIN)).toMatchObject({
        temperature: 19.6,
        windDirection: 180,
        correctedAt: NOW,
      });
    });

    it('nach einem Import mit overwriteCorrections → 409 (Wert ist nicht mehr der korrigierte)', async () => {
      const { id, correctionId } = await corrected();
      const input = providerHours(PAST, 1, () => ({ temperature: 4.2 })).map(h => ({ ...h, source: 'forecast_api' as const }));
      await store.upsertHours(input, { mode: 'upsert', importId, overwriteCorrections: true });
      const result = await apiError(service.revert(id, correctionId, [3], 'zu spät', ADMIN));
      expect(result).toMatchObject({ status: 409, code: 'CORRECTION_NOT_REVERSIBLE' });
      expect(result.message).toContain('Import');
    });

    it('US13-18: veraltete Version → 412 (nichts geschrieben); Korrektur unbekannt oder von einer anderen Stunde → 404', async () => {
      const { id, correctionId } = await corrected();
      expect(await apiError(service.revert(id, correctionId, [1], 'veraltet', ADMIN))).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
      expect((await service.history(id)).items).toHaveLength(1);
      expect(await apiError(service.revert(id, 999, [2], 'gibt es nicht', ADMIN))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(await apiError(service.revert(await idOf(CURRENT), correctionId, [1], 'falsche Stunde', ADMIN))).toMatchObject({
        status: 404,
      });
      expect(await apiError(service.revert(99_999, correctionId, [1], 'Stunde fehlt', ADMIN))).toMatchObject({ status: 404 });
    });

    it('DB: UNIQUE(reverts_correction_id) verhindert eine zweite Rücknahme auch ohne den Service', async () => {
      const { id, correctionId } = await corrected();
      await service.revert(id, correctionId, [2], 'Rücknahme', ADMIN);
      await expect(
        dataSource.query(
          `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at", "reverts_correction_id")
           VALUES (?, 'temperature', 1, 2, 'doppelt', ?, ?, ?)`,
          [id, ADMIN, NOW, correctionId],
        ),
      ).rejects.toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('findPage (US13-14, R23, R24)', () => {
    it('Berliner Kalendertag von correctedAt, absteigend, meta; to nach heute → 400 DATE_IN_FUTURE', async () => {
      const past = await idOf(PAST);
      const current = await idOf(CURRENT);
      clock.set('2026-11-18T22:59:59Z'); // 23:59:59 MEZ am 18.11.
      await service.correct(past, [1], patch({ temperature: 1 }), ADMIN);
      clock.set('2026-11-18T23:00:00Z'); // 00:00 MEZ am 19.11.
      await service.correct(past, [2], patch({ temperature: 2 }), ADMIN);
      clock.set('2026-11-19T13:20:00Z');
      await service.correct(current, [1], patch({ temperature: 3, windSpeed: 4 }), ADMIN);

      const day19 = await service.findPage({ from: '2026-11-19', to: '2026-11-19', page: 1, limit: 20 });
      expect(day19.meta).toEqual({ page: 1, limit: 20, total: 3 });
      expect(day19.items.map(e => [e.observationId, e.field, e.correctedAt])).toEqual([
        [current, 'windSpeed', '2026-11-19T13:20:00Z'],
        [current, 'temperature', '2026-11-19T13:20:00Z'],
        [past, 'temperature', '2026-11-18T23:00:00Z'],
      ]);
      expect(day19.items[0]).toEqual({
        id: expect.any(Number),
        observationId: current,
        observationTimeLocal: '2026-11-19T14:00:00+01:00',
        field: 'windSpeed',
        oldValue: expect.any(Number),
        newValue: 4,
        reason: 'Ausreißer, Nachbarstunden 9,4/9,8 °C',
        correctedBy: ADMIN,
        correctedAt: '2026-11-19T13:20:00Z',
        revertsCorrectionId: null,
      });
      expect((await service.findPage({ from: '2026-11-18', to: '2026-11-18', page: 1, limit: 20 })).meta.total).toBe(1);
      const page2 = await service.findPage({ from: '2026-11-18', to: '2026-11-19', page: 2, limit: 3 });
      expect(page2).toMatchObject({ meta: { page: 2, limit: 3, total: 4 }, items: [{ correctedAt: '2026-11-18T22:59:59Z' }] });
      expect(await service.findPage({ from: '2026-11-18', to: '2026-11-19', page: 3, limit: 3 })).toMatchObject({ items: [] });

      const future = service.findPage({ from: '2026-11-19', to: '2026-11-20', page: 1, limit: 20 });
      await expect(future).rejects.toMatchObject({ response: { statusCode: 400, code: 'DATE_IN_FUTURE', errors: [{ field: 'to' }] } });
    });
  });
});
