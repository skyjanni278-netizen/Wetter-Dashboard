import type { ObservationStore } from '../observations/observation.store';
import { RevisionCache } from './revision-cache';

function storeWithRevision(initial: string | null): { store: ObservationStore; set(revision: string | null): void } {
  let revision = initial;
  const store = { getRevision: async () => revision } as unknown as ObservationStore;
  return { store, set: value => (revision = value) };
}

describe('RevisionCache (03 B2.4)', () => {
  const now = new Date('2026-11-19T13:30:00Z');

  it('gleiche Revision und Stunde → einmal gerechnet; neue Revision → neu gerechnet', async () => {
    const { store, set } = storeWithRevision('10:2026-11-19T13:05:00Z:10');
    const cache = new RevisionCache(store);
    const compute: jest.Mock<Promise<{ value: number }>, []> = jest.fn(async () => ({ value: compute.mock.calls.length }));

    expect(await cache.get('records', now, compute)).toEqual({ value: 1 });
    expect(await cache.get('records', new Date('2026-11-19T13:59:59Z'), compute)).toEqual({ value: 1 });
    expect(compute).toHaveBeenCalledTimes(1);

    set('10:2026-11-19T13:05:00Z:11'); // ein Update in derselben Sekunde
    expect(await cache.get('records', now, compute)).toEqual({ value: 2 });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('neue volle Stunde → neu gerechnet (R08 und „heute“ hängen von jetzt ab)', async () => {
    const cache = new RevisionCache(storeWithRevision('r1').store);
    const compute = jest.fn(async () => 'x');
    await cache.get('records', now, compute);
    await cache.get('records', new Date('2026-11-19T14:00:00Z'), compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('je Name ein eigener Eintrag; ohne Revision (In-Memory-Store) wird nie zwischengespeichert', async () => {
    const cache = new RevisionCache(storeWithRevision('r1').store);
    expect(await cache.get('records', now, async () => 'a')).toBe('a');
    expect(await cache.get('summaries/years', now, async () => 'b')).toBe('b');
    expect(await cache.get('records', now, async () => 'c')).toBe('a');

    const uncached = new RevisionCache(storeWithRevision(null).store);
    const compute = jest.fn(async () => 1);
    await uncached.get('records', now, compute);
    await uncached.get('records', now, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
