import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import { emptyCounts } from './import';
import type { ImportKind } from './import';
import { Import } from './import.entity';
import { ImportAlreadyRunningError } from './import.store';
import type { NewImport } from './import.store';
import { TypeOrmImportStore } from './typeorm-import.store';

function newImport(kind: ImportKind = 'range', requestedAt = '2026-11-19T12:00:00Z'): NewImport {
  return {
    locationId: 1,
    kind,
    from: '2026-11-18',
    to: '2026-11-19',
    overwriteCorrections: false,
    requestedBy: null,
    requestedAt,
    counts: emptyCounts(),
    warnings: [],
  };
}

describe('TypeOrmImportStore (SQLite :memory:)', () => {
  let dataSource: DataSource;
  let store: TypeOrmImportStore;

  beforeEach(async () => {
    dataSource = await openTestDatabase();
    store = new TypeOrmImportStore(dataSource.getRepository(Import));
  });

  afterEach(() => dataSource.destroy());

  it('create → queued mit ID 1; update speichert Zähler, Warnungen und Fehler (Feldreihenfolge wie B2.2)', async () => {
    const created = await store.create(newImport());
    expect(created).toMatchObject({ id: 1, status: 'queued', from: '2026-11-18', to: '2026-11-19', startedAt: null, error: null });

    const done = await store.update(1, {
      status: 'partial',
      startedAt: '2026-11-19T12:00:01Z',
      finishedAt: '2026-11-19T12:00:03Z',
      counts: { inserted: 2, updated: 3, unchanged: 4, skippedCorrected: 1 },
      warnings: [{ code: 'FORECAST_FAILED', message: 'kaputt' }],
    });
    expect(done).toMatchObject({
      status: 'partial',
      counts: { inserted: 2, updated: 3, unchanged: 4, skippedCorrected: 1 },
      warnings: [{ code: 'FORECAST_FAILED', message: 'kaputt' }],
      error: null,
    });
    expect(await store.update(99, { status: 'failed' })).toBeNull();
  });

  it('R19: zweiter Import während queued/running → ImportAlreadyRunningError; danach wieder möglich', async () => {
    await store.create(newImport());
    await expect(store.create(newImport('gaps'))).rejects.toEqual(new ImportAlreadyRunningError(1));
    await store.update(1, { status: 'running' });
    await expect(store.create(newImport('gaps'))).rejects.toBeInstanceOf(ImportAlreadyRunningError);
    await store.update(1, { status: 'succeeded', finishedAt: '2026-11-19T12:00:03Z' });
    expect((await store.create(newImport('gaps'))).id).toBe(2);
  });

  it('R19 in der DB: der partielle Unique-Index verhindert einen zweiten laufenden Import auch ohne Prüfung', async () => {
    await store.create(newImport());
    await expect(
      dataSource.query(
        `INSERT INTO "import" ("location_id", "kind", "status", "from_date", "to_date", "requested_at") VALUES (1, 'gaps', 'running', '2026-11-01', '2026-11-02', '2026-11-19T12:00:00Z')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('markInterrupted: queued/running → failed mit INTERRUPTED und finishedAt; andere bleiben', async () => {
    await store.create(newImport());
    await store.update(1, { status: 'succeeded', finishedAt: '2026-11-19T12:00:03Z' });
    await store.create(newImport());
    await store.update(2, { status: 'running', startedAt: '2026-11-19T12:10:00Z' });

    expect(await store.markInterrupted('2026-11-19T13:00:00Z')).toEqual([2]);
    expect(await store.findById(2)).toMatchObject({
      status: 'failed',
      finishedAt: '2026-11-19T13:00:00Z',
      error: { code: 'INTERRUPTED', message: expect.any(String) },
    });
    expect((await store.findById(1))?.status).toBe('succeeded');
    expect(await store.markInterrupted('2026-11-19T13:00:00Z')).toEqual([]);
  });

  it('findPage: nach requestedAt absteigend (Gleichstand id absteigend), Filter, total über alle Seiten', async () => {
    for (const [kind, at] of [
      ['scheduled', '2026-11-19T11:05:00Z'],
      ['range', '2026-11-19T13:10:00Z'],
      ['scheduled', '2026-11-19T11:05:00Z'],
    ] as const) {
      const record = await store.create(newImport(kind, at));
      await store.update(record.id, { status: 'succeeded', finishedAt: at });
    }
    const page = await store.findPage({ locationId: 1, offset: 0, limit: 2 });
    expect(page.items.map(i => i.id)).toEqual([2, 3]);
    expect(page.total).toBe(3);
    const filtered = await store.findPage({ locationId: 1, kind: 'scheduled', offset: 1, limit: 5 });
    expect(filtered).toMatchObject({ total: 2, items: [{ id: 1 }] });
  });

  it('findLastFinished: jüngstes finishedAt mit passender Art und Status', async () => {
    for (const [kind, status, at] of [
      ['range', 'succeeded', '2026-11-19T10:00:00Z'],
      ['legacy', 'succeeded', '2026-11-19T12:00:00Z'],
      ['gaps', 'failed', '2026-11-19T13:00:00Z'],
    ] as const) {
      const record = await store.create(newImport(kind, at));
      await store.update(record.id, { status, finishedAt: at });
    }
    const last = await store.findLastFinished({
      locationId: 1,
      kinds: ['scheduled', 'range', 'gaps'],
      statuses: ['succeeded', 'partial'],
    });
    expect(last?.id).toBe(1);
  });
});
