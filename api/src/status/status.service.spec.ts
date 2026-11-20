import { FakeLegacySource, legacyDay } from '../../test/support/fakes';
import { FixedClock } from '../common/clock';
import { emptyCounts } from '../imports/import';
import type { ImportKind, ImportStatus } from '../imports/import';
import { InMemoryImportStore } from '../imports/in-memory-import.store';
import { InMemoryObservationStore } from '../observations/in-memory-observation.store';
import { StatusService, UPDATE_DELAYED_AFTER_MS, updateStateOf } from './status.service';

const FINISHED = '2026-11-19T12:00:00Z';

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

function setup(now: string) {
  const legacy = new FakeLegacySource();
  legacy.days.set('2025-01-01', legacyDay('2025-01-01'));
  legacy.days.set('2026-11-19', legacyDay('2026-11-19'));
  const imports = new InMemoryImportStore();
  const clock = new FixedClock(now);
  const service = new StatusService(new InMemoryObservationStore(legacy.asSource(), clock), imports, clock);
  return { imports, clock, service };
}

describe('StatusService (US07-1/-2, R25)', () => {
  it('Schwelle ist 2 h', () => {
    expect(UPDATE_DELAYED_AFTER_MS).toBe(7_200_000);
  });

  it('ohne Import: updateState "never", lastSuccessfulUpdateAt null, Datenzeitraum aus dem Store', async () => {
    const { service } = setup('2026-11-19T13:30:00Z');
    expect(await service.find()).toEqual({
      locationId: 1,
      today: '2026-11-19',
      timezone: 'Europe/Berlin',
      dataFrom: '2025-01-01',
      dataTo: '2026-11-19',
      lastSuccessfulUpdateAt: null,
      updateState: 'never',
    });
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
