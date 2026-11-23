import type { SchedulerRegistry } from '@nestjs/schedule';
import { CronTime } from 'cron';
import { hoursInDay, localDateTime, startOfDayUtc } from '../common/berlin-time';
import { FixedClock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { emptyCounts } from '../imports/import';
import type { ImportKind, ImportStatus } from '../imports/import';
import { InMemoryImportStore } from '../imports/in-memory-import.store';
import { GapsService } from '../observations/gaps.service';
import type { ObservationHour, StoredDay } from '../observations/observation';
import type { ObservationStore } from '../observations/observation.store';
import { SCHEDULED_IMPORT_JOB, SCHEDULER_CRON } from '../scheduler/scheduler.service';
import { AggregationService } from '../stats/aggregation.service';
import { RevisionCache } from '../stats/revision-cache';
import { StatusService, UPDATE_DELAYED_AFTER_MS, updateStateOf } from './status.service';

const FINISHED = '2026-11-19T12:00:00Z';
const HOUR_MS = 3_600_000;

async function finishedImport(
  store: InMemoryImportStore,
  kind: ImportKind,
  status: ImportStatus,
  finishedAt: string,
): Promise<void> {
  const record = await store.create({
    locationId: 1,
    kind,
    from: '2026-11-01',
    to: '2026-11-02',
    overwriteCorrections: false,
    requestedBy: null,
    requestedAt: finishedAt,
    counts: emptyCounts(),
    warnings: [],
  });
  await store.update(record.id, { status, startedAt: finishedAt, finishedAt });
}

/** Alle Stunden eines Berliner Tages (bis `until`), Werte gesetzt; `edit` ändert oder entfernt (`null`) Stunden. */
function storedDay(date: string, edit: (i: number, h: ObservationHour) => ObservationHour | null = (_, h) => h): StoredDay {
  const start = startOfDayUtc(date).getTime();
  const hours: ObservationHour[] = [];
  for (let i = 0; i < hoursInDay(date); i++) {
    const instant = new Date(start + i * HOUR_MS);
    const hour: ObservationHour = {
      id: Math.floor(start / HOUR_MS) + i,
      timeLocal: localDateTime(instant),
      timeUtc: formatUtc(instant),
      temperature: 5,
      apparentTemperature: 2,
      precipitation: 0,
      weatherCode: 3,
      windSpeed: 10,
      windDirection: 200,
      source: 'forecast_api',
      correctedAt: null,
    };
    const edited = edit(i, hour);
    if (edited) hours.push(edited);
  }
  return { date, hours };
}

/** Stub-Store: liefert die Tage aus `days` und eine Revision, die ein Test ändern kann. */
function stubStore(days: StoredDay[]) {
  const state = { revision: 'r1', ranges: 0 };
  const store = {
    getDataRange: async () => ({ from: days[0]?.date ?? null, to: days[days.length - 1]?.date ?? null }),
    getRange: async (from: string, to: string) => {
      state.ranges++;
      return days.filter(day => day.date >= from && day.date <= to);
    },
    getRevision: async () => state.revision,
  } as unknown as ObservationStore;
  return { store, state };
}

/** Registry mit dem Cron-Job des Schedulers (Regel wie `SchedulerService`, Europe/Berlin). */
function registryWithJob(isActive = true): SchedulerRegistry {
  const job = { isActive, cronTime: new CronTime(SCHEDULER_CRON, 'Europe/Berlin') };
  return {
    doesExist: (type: string, name: string) => type === 'cron' && name === SCHEDULED_IMPORT_JOB,
    getCronJob: () => job,
  } as unknown as SchedulerRegistry;
}

function setup(now: string, days: StoredDay[] = [storedDay('2026-11-18')], scheduler?: SchedulerRegistry) {
  const { store, state } = stubStore(days);
  const imports = new InMemoryImportStore();
  const clock = new FixedClock(now);
  const service = new StatusService(
    store,
    imports,
    clock,
    new GapsService(store, clock),
    new AggregationService(),
    new RevisionCache(store),
    scheduler,
  );
  return { imports, clock, service, state };
}

describe('StatusService (US07-1/-2, US16-1 bis -3, R25)', () => {
  it('Schwelle ist 2 h', () => {
    expect(UPDATE_DELAYED_AFTER_MS).toBe(7_200_000);
  });

  it('ohne Import: updateState "never", ohne Scheduler nextScheduledUpdateAt null, alle Felder in B2.2-Reihenfolge', async () => {
    const { service } = setup('2026-11-19T13:30:00Z');
    const status = await service.find();
    expect(status).toEqual({
      locationId: 1,
      today: '2026-11-19',
      timezone: 'Europe/Berlin',
      dataFrom: '2026-11-18',
      dataTo: '2026-11-18',
      lastSuccessfulUpdateAt: null,
      nextScheduledUpdateAt: null,
      updateState: 'never',
      daysWithData: 1,
      daysComplete: 1,
      gapCount: 1,
    });
    expect(Object.keys(status)).toEqual([
      'locationId',
      'today',
      'timezone',
      'dataFrom',
      'dataTo',
      'lastSuccessfulUpdateAt',
      'nextScheduledUpdateAt',
      'updateState',
      'daysWithData',
      'daysComplete',
      'gapCount',
    ]);
  });

  it('R25: genau 2 h nach dem letzten erfolgreichen Import → ok', async () => {
    const { service, imports } = setup('2026-11-19T14:00:00Z');
    await finishedImport(imports, 'range', 'succeeded', FINISHED);
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: FINISHED, updateState: 'ok' });
  });

  it('R25: 2 h 1 s danach → delayed', async () => {
    const { service, imports } = setup('2026-11-19T14:00:01Z');
    await finishedImport(imports, 'range', 'succeeded', FINISHED);
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: FINISHED, updateState: 'delayed' });
  });

  it('US16-2: letzter Erfolg 11:05 MEZ, jetzt 14:30 MEZ → delayed', async () => {
    const { service, imports } = setup('2026-11-19T13:30:00Z');
    await finishedImport(imports, 'scheduled', 'succeeded', '2026-11-19T10:05:12Z');
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' });
  });

  it('R25: partial zählt als erfolgreich, failed nicht', async () => {
    const { service, imports } = setup('2026-11-19T13:00:00Z');
    await finishedImport(imports, 'gaps', 'partial', FINISHED);
    await finishedImport(imports, 'range', 'failed', '2026-11-19T12:30:00Z');
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: FINISHED, updateState: 'ok' });
  });

  it('R25: nur fehlgeschlagene Importe → never', async () => {
    const { service, imports } = setup('2026-11-19T13:00:00Z');
    await finishedImport(imports, 'range', 'failed', FINISHED);
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: null, updateState: 'never' });
  });

  it('R25: nur ein legacy-Import → never', async () => {
    const { service, imports } = setup('2026-11-19T13:00:00Z');
    await finishedImport(imports, 'legacy', 'succeeded', FINISHED);
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: null, updateState: 'never' });
  });

  it('R25: manuelle range- und gaps-Importe zählen wie scheduled (offener Punkt aus Schritt 11)', async () => {
    for (const kind of ['range', 'gaps', 'scheduled'] as const) {
      const { service, imports } = setup('2026-11-19T13:00:00Z');
      await finishedImport(imports, kind, 'succeeded', FINISHED);
      expect([kind, (await service.find()).updateState]).toEqual([kind, 'ok']);
    }
  });

  it('R25: maßgeblich ist der zuletzt abgeschlossene erfolgreiche Import', async () => {
    const { service, imports } = setup('2026-11-19T15:00:00Z');
    await finishedImport(imports, 'scheduled', 'succeeded', '2026-11-19T13:30:00Z');
    await finishedImport(imports, 'range', 'succeeded', '2026-11-19T10:00:00Z');
    expect(await service.find()).toMatchObject({ lastSuccessfulUpdateAt: '2026-11-19T13:30:00Z', updateState: 'ok' });
  });

  it('updateStateOf: Grenzen', () => {
    const at = (iso: string) => new Date(iso);
    expect(updateStateOf(null, at('2026-11-19T14:00:00Z'))).toBe('never');
    expect(updateStateOf(FINISHED, at('2026-11-19T12:00:00Z'))).toBe('ok');
    expect(updateStateOf(FINISHED, at('2026-11-19T14:00:00Z'))).toBe('ok');
    expect(updateStateOf(FINISHED, at('2026-11-19T14:00:01Z'))).toBe('delayed');
  });
});

describe('StatusService: nextScheduledUpdateAt über die SchedulerRegistry (N01, US16-1/-3)', () => {
  it('US16-1: jetzt 14:30 MEZ → nächster Lauf 15:05 MEZ = 2026-11-19T14:05:00Z', async () => {
    const { service } = setup('2026-11-19T13:30:00Z', undefined, registryWithJob());
    expect((await service.find()).nextScheduledUpdateAt).toBe('2026-11-19T14:05:00Z');
  });

  it('genau zur Laufzeit 14:05 MEZ → der nächste (15:05 MEZ); eine Sekunde vorher → dieser', async () => {
    expect((await setup('2026-11-19T13:05:00Z', undefined, registryWithJob()).service.find()).nextScheduledUpdateAt).toBe(
      '2026-11-19T14:05:00Z',
    );
    expect((await setup('2026-11-19T13:04:59Z', undefined, registryWithJob()).service.find()).nextScheduledUpdateAt).toBe(
      '2026-11-19T13:05:00Z',
    );
  });

  it('Sommerzeit: jetzt 14:30 MESZ (12:30Z) → 15:05 MESZ = 13:05Z', async () => {
    const { service } = setup('2026-07-02T12:30:00Z', undefined, registryWithJob());
    expect((await service.find()).nextScheduledUpdateAt).toBe('2026-07-02T13:05:00Z');
  });

  it('US16-3: ohne Registry (SCHEDULER_ENABLED=false) oder mit gestopptem Job → null', async () => {
    expect((await setup('2026-11-19T13:30:00Z').service.find()).nextScheduledUpdateAt).toBeNull();
    expect((await setup('2026-11-19T13:30:00Z', undefined, registryWithJob(false)).service.find()).nextScheduledUpdateAt).toBeNull();
    const empty = { doesExist: () => false } as unknown as SchedulerRegistry;
    expect((await setup('2026-11-19T13:30:00Z', undefined, empty).service.find()).nextScheduledUpdateAt).toBeNull();
  });
});

describe('StatusService: daysWithData, daysComplete, gapCount (N04, R26, US17-1/-2)', () => {
  const NOW = '2026-11-19T13:30:00Z'; // 14:30 MEZ

  it('ohne Daten: alle Kennzahlen 0', async () => {
    const { service } = setup(NOW, []);
    expect(await service.find()).toMatchObject({ dataFrom: null, daysWithData: 0, daysComplete: 0, gapCount: 0 });
  });

  it('US17-2: 3 fehlende Stunden am 12.11., eine Temperatur null am 14.11. → gapCount 2; daysComplete ohne diese Tage', async () => {
    const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map(date =>
      storedDay(date, (i, h) => {
        if (date === '2026-11-12' && i >= 3 && i <= 5) return null;
        if (date === '2026-11-14' && i === 10) return { ...h, temperature: null };
        return h;
      }),
    );
    // Heute bis 14:00 MEZ vorhanden (die laufende Stunde 14:00 zählt für Lücken noch nicht).
    days.push(storedDay('2026-11-19', (i, h) => (i <= 14 ? h : null)));
    const { service } = setup(NOW, days);
    expect(await service.find()).toMatchObject({
      dataFrom: '2026-11-12',
      daysWithData: 5,
      daysComplete: 2,
      // 12.11. (missing), 14.11. (null_values), 16.–18.11. fehlen ganz (eine Lücke bis heute 00:00).
      gapCount: 3,
    });
  });

  it('R26: zwei Lücken mit einer vorhandenen Stunde dazwischen zählen als 2; künftige Stunden von heute sind keine Lücke', async () => {
    const today = storedDay('2026-11-19', (i, h) => (i === 3 || i === 5 || i > 14 ? null : h));
    const { service } = setup(NOW, [today]);
    expect(await service.find()).toMatchObject({ daysWithData: 1, daysComplete: 0, gapCount: 2 });
  });

  it('B2.4: Kennzahlen kommen aus dem RevisionCache; eine neue Datenrevision rechnet neu', async () => {
    const { service, state } = setup(NOW, [storedDay('2026-11-18')]);
    await service.find();
    const after = state.ranges;
    await service.find();
    expect(state.ranges).toBe(after);
    state.revision = 'r2';
    await service.find();
    expect(state.ranges).toBeGreaterThan(after);
  });
});
