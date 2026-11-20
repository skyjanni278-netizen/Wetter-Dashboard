import { Injectable } from '@nestjs/common';
import { ACTIVE_IMPORT_STATUSES } from './import';
import type { ImportKind, ImportRecord, ImportStatus } from './import';
import { ImportAlreadyRunningError } from './import.store';
import type { ImportStore, ImportUpdate, NewImport } from './import.store';

/** `ImportStore` im Arbeitsspeicher (Schritt 3, bis Schritt 9). IDs beginnen nach jedem Start bei 1. */
@Injectable()
export class InMemoryImportStore implements ImportStore {
  private readonly records = new Map<number, ImportRecord>();
  private nextId = 1;

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
}

function clone(record: ImportRecord): ImportRecord {
  return {
    ...record,
    counts: { ...record.counts },
    warnings: record.warnings.map(w => ({ ...w })),
    error: record.error ? { ...record.error } : null,
  };
}
