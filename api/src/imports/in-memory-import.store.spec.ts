import { emptyCounts } from './import';
import type { ImportKind, ImportStatus } from './import';
import { InMemoryImportStore } from './in-memory-import.store';

/** Legt einen abgeschlossenen Import an (der nächste darf dann starten, R19). */
async function add(store: InMemoryImportStore, kind: ImportKind, status: ImportStatus, requestedAt: string) {
  const record = await store.create({
    locationId: 1,
    kind,
    from: '2026-11-01',
    to: '2026-11-02',
    overwriteCorrections: false,
    requestedBy: null,
    requestedAt,
    counts: emptyCounts(),
    warnings: [],
  });
  await store.update(record.id, { status, finishedAt: requestedAt });
  return record.id;
}

describe('InMemoryImportStore.findPage (US11-2, R24)', () => {
  async function filled() {
    const store = new InMemoryImportStore();
    // Absichtlich nicht in zeitlicher Reihenfolge angelegt.
    await add(store, 'range', 'succeeded', '2026-11-19T10:00:00Z'); // 1
    await add(store, 'scheduled', 'failed', '2026-11-19T12:00:00Z'); // 2
    await add(store, 'gaps', 'failed', '2026-11-18T09:00:00Z'); // 3
    await add(store, 'scheduled', 'succeeded', '2026-11-19T12:00:00Z'); // 4, gleiche Zeit wie 2
    return store;
  }

  it('sortiert nach requestedAt absteigend, bei Gleichstand nach id absteigend; total = alle Treffer', async () => {
    const store = await filled();
    const page = await store.findPage({ locationId: 1, offset: 0, limit: 20 });
    expect(page.items.map(r => r.id)).toEqual([4, 2, 1, 3]);
    expect(page.total).toBe(4);
  });

  it('filtert nach status und kind (beide zusammen möglich)', async () => {
    const store = await filled();
    expect((await store.findPage({ locationId: 1, status: 'failed', offset: 0, limit: 20 })).items.map(r => r.id)).toEqual([2, 3]);
    expect((await store.findPage({ locationId: 1, kind: 'scheduled', offset: 0, limit: 20 })).items.map(r => r.id)).toEqual([4, 2]);
    const both = await store.findPage({ locationId: 1, status: 'failed', kind: 'gaps', offset: 0, limit: 20 });
    expect(both.items.map(r => r.id)).toEqual([3]);
    expect(both.total).toBe(1);
  });

  it('offset und limit schneiden die Seite, total bleibt; hinter dem Ende items = []', async () => {
    const store = await filled();
    const second = await store.findPage({ locationId: 1, offset: 2, limit: 2 });
    expect(second.items.map(r => r.id)).toEqual([1, 3]);
    expect(second.total).toBe(4);
    expect(await store.findPage({ locationId: 1, offset: 20, limit: 20 })).toEqual({ items: [], total: 4 });
  });

  it('anderer Standort → leer', async () => {
    const store = await filled();
    expect(await store.findPage({ locationId: 2, offset: 0, limit: 20 })).toEqual({ items: [], total: 0 });
  });

  it('liefert Kopien (Änderungen am Ergebnis ändern den Store nicht)', async () => {
    const store = await filled();
    const [first] = (await store.findPage({ locationId: 1, offset: 0, limit: 1 })).items;
    first.counts.inserted = 99;
    expect((await store.findById(first.id))?.counts.inserted).toBe(0);
  });
});
