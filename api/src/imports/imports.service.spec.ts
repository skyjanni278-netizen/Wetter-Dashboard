import { ApiException } from '../common/api.exception';
import { ApiValidationException } from '../common/api-validation.exception';
import { FixedClock } from '../common/clock';
import { toImportResource } from './import';
import type { ImportRunner } from './import-runner';
import { ImportAlreadyRunningError } from './import.store';
import { ImportsService } from './imports.service';
import { InMemoryImportStore } from './in-memory-import.store';

function setup() {
  const store = new InMemoryImportStore();
  const runner = { schedule: jest.fn() };
  const clock = new FixedClock('2026-11-19T13:10:00Z');
  const service = new ImportsService(store, runner as unknown as ImportRunner, clock);
  return { store, runner, service };
}

describe('ImportsService (US10-3, US11, R19)', () => {
  it('legt den Auftrag mit queued an und startet ihn erst danach', async () => {
    const { service, runner } = setup();
    const record = await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);

    expect(record).toEqual({
      id: 1,
      locationId: 1,
      kind: 'range',
      status: 'queued',
      from: '2026-10-01',
      to: '2026-10-03',
      overwriteCorrections: false,
      requestedBy: 1,
      requestedAt: '2026-11-19T13:10:00Z',
      startedAt: null,
      finishedAt: null,
      counts: { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 },
      warnings: [],
      error: null,
    });
    expect(runner.schedule).toHaveBeenCalledWith(1);
    expect(toImportResource(record).links).toEqual({ self: '/api/imports/1' });
  });

  it('R19: zweiter Auftrag, während einer queued/running ist → 409 mit runningImportId', async () => {
    const { service, store, runner } = setup();
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);

    const queued = service.create({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' }, 1);
    await expect(queued).rejects.toBeInstanceOf(ApiException);
    await expect(queued).rejects.toMatchObject({
      response: { statusCode: 409, code: 'IMPORT_RUNNING', errors: [], details: { runningImportId: 1 } },
    });

    await store.update(1, { status: 'running' });
    await expect(service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1)).rejects.toMatchObject({
      status: 409,
    });
    expect(runner.schedule).toHaveBeenCalledTimes(1);
  });

  it('R19: nach dem Ende eines Imports ist ein neuer möglich', async () => {
    const { service, store } = setup();
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);
    await store.update(1, { status: 'failed', finishedAt: '2026-11-19T13:10:05Z' });
    const second = await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);
    expect(second.id).toBe(2);
  });

  it('US11-3: unbekannter Import → 404', async () => {
    const { service } = setup();
    await expect(service.findOne(999)).rejects.toMatchObject({ response: { statusCode: 404, code: 'NOT_FOUND' } });
  });

  it('US11-2: findPage liefert Ressourcen mit links.self und meta = { page, limit, total }', async () => {
    const { service, store } = setup();
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);
    await store.update(1, { status: 'failed', finishedAt: '2026-11-19T13:10:05Z' });
    await service.create({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' }, 1);

    const page = await service.findPage({ page: 2, limit: 1 });
    expect(page.meta).toEqual({ page: 2, limit: 1, total: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: 1, links: { self: '/api/imports/1' } }); // gleiche Zeit → höhere id zuerst

    const failed = await service.findPage({ page: 1, limit: 20, status: 'failed' });
    expect(failed.items.map(i => i.id)).toEqual([1]);
    expect(failed.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });
});

describe('ImportsService: R02 / US10-5 (to nicht nach heute, Clock über Mitternacht MEZ)', () => {
  it('to = heute ist erlaubt, to = morgen → 400 DATE_IN_FUTURE am Feld to, nichts angelegt', async () => {
    const store = new InMemoryImportStore();
    const runner = { schedule: jest.fn() };
    const clock = new FixedClock('2026-11-19T22:59:59Z'); // 23:59:59 MEZ am 19.11.
    const service = new ImportsService(store, runner as unknown as ImportRunner, clock);

    const future = service.create({ kind: 'range', from: '2026-11-18', to: '2026-11-20' }, 1);
    await expect(future).rejects.toBeInstanceOf(ApiValidationException);
    await expect(future).rejects.toMatchObject({
      response: { statusCode: 400, code: 'DATE_IN_FUTURE', errors: [{ field: 'to', code: 'too_big' }] },
    });
    expect(await store.findById(1)).toBeNull();
    expect(runner.schedule).not.toHaveBeenCalled();

    const today = await service.create({ kind: 'range', from: '2026-11-18', to: '2026-11-19' }, 1);
    expect(today.to).toBe('2026-11-19');

    await store.update(today.id, { status: 'succeeded', finishedAt: '2026-11-19T23:00:00Z' });
    clock.set('2026-11-19T23:00:00Z'); // 00:00 MEZ am 20.11.
    const midnight = await service.create({ kind: 'gaps', from: '2026-11-20', to: '2026-11-20' }, 1);
    expect(midnight.to).toBe('2026-11-20');
  });

  it('R20: overwriteCorrections wird gespeichert (fehlt = false); requestedBy = Konto aus dem Token', async () => {
    const { service, store } = setup();
    const record = await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-01', overwriteCorrections: true }, 7);
    expect(record).toMatchObject({ overwriteCorrections: true, requestedBy: 7 });
    await store.update(record.id, { status: 'succeeded', finishedAt: '2026-11-19T13:11:00Z' });
    const plain = await service.create({ kind: 'gaps', from: '2026-10-01', to: '2026-10-01' }, 7);
    expect(plain.overwriteCorrections).toBe(false);
  });
});

describe('ImportsService.createScheduled (Scheduler, US08)', () => {
  it('legt einen Import kind = "scheduled" an und startet ihn', async () => {
    const { service, runner } = setup();
    const record = await service.createScheduled('2026-11-18', '2026-11-19');
    expect(record).toMatchObject({ id: 1, kind: 'scheduled', status: 'queued', from: '2026-11-18', to: '2026-11-19' });
    expect(runner.schedule).toHaveBeenCalledWith(1);
  });

  it('R19: läuft ein Import, kommt ImportAlreadyRunningError statt 409 (der Scheduler überspringt)', async () => {
    const { service, store, runner } = setup();
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' }, 1);

    await expect(service.createScheduled('2026-11-18', '2026-11-19')).rejects.toBeInstanceOf(ImportAlreadyRunningError);
    expect(await store.findById(2)).toBeNull();
    expect(runner.schedule).toHaveBeenCalledTimes(1);
  });
});
