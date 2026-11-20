import { Logger } from '@nestjs/common';
import { FixedClock } from '../common/clock';
import type { ImportRunner } from '../imports/import-runner';
import { ImportsService } from '../imports/imports.service';
import { InMemoryImportStore } from '../imports/in-memory-import.store';
import { isSchedulerEnabled } from './scheduler-enabled';
import { SchedulerService } from './scheduler.service';

function setup(enabled = true, now = '2026-11-20T09:05:00Z') {
  const store = new InMemoryImportStore();
  const runner = { schedule: jest.fn() };
  const clock = new FixedClock(now);
  const imports = new ImportsService(store, runner as unknown as ImportRunner, clock);
  const scheduler = new SchedulerService(imports, clock, enabled);
  return { store, runner, clock, imports, scheduler };
}

describe('SchedulerService (US08, R19)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tick() ohne laufenden Import → genau ein Import "scheduled" für gestern und heute', async () => {
    const { scheduler, store, runner } = setup();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const record = await scheduler.tick();

    expect(record).toMatchObject({
      id: 1,
      kind: 'scheduled',
      status: 'queued',
      from: '2026-11-19',
      to: '2026-11-20',
      requestedBy: null,
      requestedAt: '2026-11-20T09:05:00Z',
    });
    expect(runner.schedule).toHaveBeenCalledTimes(1);
    expect(runner.schedule).toHaveBeenCalledWith(1);
    expect(await store.findById(2)).toBeNull();
  });

  it('bestimmt gestern und heute nach Berliner Kalendertag (00:30 MEZ = 23:30 UTC am Vortag)', async () => {
    const { scheduler } = setup(true, '2026-11-19T23:30:00Z');
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await expect(scheduler.tick()).resolves.toMatchObject({ from: '2026-11-19', to: '2026-11-20' });
  });

  it.each(['running', 'queued'] as const)(
    'US08-4: tick(), während ein Import %s ist → kein zweiter Import, Warnung „übersprungen“',
    async status => {
      const { scheduler, imports, store, runner } = setup();
      await imports.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });
      await store.update(1, { status });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(scheduler.tick()).resolves.toBeNull();

      expect(await store.findById(2)).toBeNull();
      expect(runner.schedule).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('übersprungen');
      expect(warn.mock.calls[0][0]).toContain('Import 1');
    },
  );

  it('nach dem Ende des laufenden Imports legt der nächste Lauf wieder einen an', async () => {
    const { scheduler, imports, store } = setup();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await imports.create({ kind: 'range', from: '2026-10-01', to: '2026-10-03' });

    await expect(scheduler.tick()).resolves.toBeNull();
    await store.update(1, { status: 'succeeded', finishedAt: '2026-11-20T09:06:00Z' });

    await expect(scheduler.tick()).resolves.toMatchObject({ id: 2, kind: 'scheduled' });
  });

  it('wirft nie: ein anderer Fehler wird als Fehler geloggt, tick() liefert null', async () => {
    const { scheduler, imports } = setup();
    jest.spyOn(imports, 'createScheduled').mockRejectedValue(new Error('Store kaputt'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(scheduler.tick()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Store kaputt'));
  });

  it('SCHEDULER_ENABLED=false: tick() legt keinen Import an', async () => {
    const { scheduler, imports, store, runner } = setup(false);
    const createScheduled = jest.spyOn(imports, 'createScheduled');

    await expect(scheduler.tick()).resolves.toBeNull();

    expect(createScheduled).not.toHaveBeenCalled();
    expect(runner.schedule).not.toHaveBeenCalled();
    expect(await store.findById(1)).toBeNull();
  });

  it('meldet beim Start, ob der Scheduler aktiv ist', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    setup(false).scheduler.onApplicationBootstrap();
    setup(true).scheduler.onApplicationBootstrap();

    expect(log.mock.calls[0][0]).toBe('Scheduler deaktiviert (SCHEDULER_ENABLED ist nicht "true")');
    expect(log.mock.calls[1][0]).toContain('Scheduler aktiv: 0 5 * * * * (Europe/Berlin)');
  });
});

describe('isSchedulerEnabled (SCHEDULER_ENABLED)', () => {
  it('Standard false: Variable fehlt', () => {
    expect(isSchedulerEnabled({})).toBe(false);
  });

  it.each(['false', '', 'TRUE', 'True', '1', 'yes', ' true'])('"%s" → false', value => {
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: value })).toBe(false);
  });

  it('nur exakt "true" → true', () => {
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'true' })).toBe(true);
  });
});
