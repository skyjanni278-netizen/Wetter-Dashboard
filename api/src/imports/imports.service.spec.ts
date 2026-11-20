import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FixedClock } from '../common/clock';
import { parseCreateImportBody } from './create-import.input';
import { toImportResource } from './import';
import type { ImportRunner } from './import-runner';
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
    const record = await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });

    expect(record).toEqual({
      id: 1,
      locationId: 1,
      kind: 'range',
      status: 'queued',
      from: '2026-10-01',
      to: '2026-10-03',
      overwriteCorrections: false,
      requestedBy: null,
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
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });

    const queued = service.create({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' });
    await expect(queued).rejects.toBeInstanceOf(ConflictException);
    await expect(queued).rejects.toMatchObject({ response: { statusCode: 409, runningImportId: 1 } });

    await store.update(1, { status: 'running' });
    await expect(service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' })).rejects.toMatchObject({
      status: 409,
    });
    expect(runner.schedule).toHaveBeenCalledTimes(1);
  });

  it('R19: nach dem Ende eines Imports ist ein neuer möglich', async () => {
    const { service, store } = setup();
    await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });
    await store.update(1, { status: 'failed', finishedAt: '2026-11-19T13:10:05Z' });
    const second = await service.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });
    expect(second.id).toBe(2);
  });

  it('US11-3: unbekannter Import → 404', async () => {
    const { service } = setup();
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('parseCreateImportBody (minimale Prüfung, Zod-DTO folgt in Schritt 4)', () => {
  it('nimmt range und gaps an', () => {
    expect(parseCreateImportBody({ kind: 'gaps', from: '2026-10-01', to: '2026-10-03' })).toEqual({
      kind: 'gaps',
      from: '2026-10-01',
      to: '2026-10-03',
    });
  });

  it.each([
    ['kein Objekt', 'range'],
    ['Liste', []],
    ['kind scheduled', { kind: 'scheduled', from: '2026-10-01', to: '2026-10-03' }],
    ['from fehlt', { kind: 'range', to: '2026-10-03' }],
    ['to ungültig', { kind: 'range', from: '2026-10-01', to: '2026-02-30' }],
  ])('%s → 400', (_name, body) => {
    expect(() => parseCreateImportBody(body)).toThrow(BadRequestException);
  });
});
