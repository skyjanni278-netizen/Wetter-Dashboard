import { Inject, Injectable, Optional } from '@nestjs/common';
import { ACTIVE_FIXTURE } from '../fixtures/fixture';
import type { Fixture } from '../fixtures/fixture';
import { HEUBACH } from '../locations/location';
import { ACTIVE_IMPORT_STATUSES, emptyCounts } from './import';
import type { ImportKind, ImportRecord, ImportStatus } from './import';
import { ImportAlreadyRunningError, INTERRUPTED_ERROR } from './import.store';
import type { ImportPage, ImportPageQuery, ImportStore, ImportUpdate, NewImport } from './import.store';

/**
 * `ImportStore` im Arbeitsspeicher (Schritt 3; seit Schritt 9 nur Unit-Tests und Testpfad). IDs ab 1 nach jedem Start.
 * Mit einer Fixture stehen die Importe der Fixture schon darin (für `updateState`, R25, US16).
 */
@Injectable()
export class InMemoryImportStore implements ImportStore {
  private readonly records = new Map<number, ImportRecord>();
  private nextId = 1;

  constructor(@Optional() @Inject(ACTIVE_FIXTURE) fixture: Fixture | null = null) {
    for (const entry of fixture?.imports ?? []) {
      const id = this.nextId++;
      this.records.set(id, {
        ...entry,
        id,
        locationId: HEUBACH.id,
        overwriteCorrections: false,
        requestedBy: null,
        counts: emptyCounts(),
        warnings: [],
        error: null,
      });
    }
  }

  async create(input: NewImport): Promise<ImportRecord> {
    // Synchron zwischen Prüfung und Anlegen: kein zweiter Aufruf kann dazwischenkommen (R19).
    for (const record of this.records.values()) {
      if (record.locationId === input.locationId && ACTIVE_IMPORT_STATUSES.includes(record.status)) {
        throw new ImportAlreadyRunningError(record.id);
      }
    }
    const record: ImportRecord = {
      ...input,
      id: this.nextId++,
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      error: null,
    };
    this.records.set(record.id, record);
    return clone(record);
  }

  async findById(id: number): Promise<ImportRecord | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async update(id: number, changes: ImportUpdate): Promise<ImportRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;
    const next = clone({ ...record, ...changes });
    this.records.set(id, next);
    return clone(next);
  }

  async findPage(query: ImportPageQuery): Promise<ImportPage> {
    const matches = [...this.records.values()]
      .filter(
        record =>
          record.locationId === query.locationId &&
          (query.status === undefined || record.status === query.status) &&
          (query.kind === undefined || record.kind === query.kind),
      )
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt) || b.id - a.id);
    return {
      items: matches.slice(query.offset, query.offset + query.limit).map(clone),
      total: matches.length,
    };
  }

  async findLastFinished(filter: {
    locationId: number;
    kinds: readonly ImportKind[];
    statuses: readonly ImportStatus[];
  }): Promise<ImportRecord | null> {
    let latest: ImportRecord | null = null;
    for (const record of this.records.values()) {
      if (
        record.locationId !== filter.locationId ||
        !filter.kinds.includes(record.kind) ||
        !filter.statuses.includes(record.status) ||
        record.finishedAt === null
      ) {
        continue;
      }
      if (latest === null || Date.parse(record.finishedAt) > Date.parse(latest.finishedAt ?? '')) {
        latest = record;
      }
    }
    return latest ? clone(latest) : null;
  }

  async markInterrupted(finishedAt: string): Promise<number[]> {
    const ids: number[] = [];
    for (const record of this.records.values()) {
      if (!ACTIVE_IMPORT_STATUSES.includes(record.status)) continue;
      record.status = 'failed';
      record.finishedAt = finishedAt;
      record.error = { ...INTERRUPTED_ERROR };
      ids.push(record.id);
    }
    return ids;
  }
}

function clone(record: ImportRecord): ImportRecord {
  return {
    ...record,
    counts: { ...record.counts },
    warnings: record.warnings.map(w => ({ ...w })),
    error: record.error ? { ...record.error } : null,
  };
}
