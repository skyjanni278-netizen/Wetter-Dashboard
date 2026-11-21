import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not } from 'typeorm';
import type { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/api-exception.filter';
import { ACTIVE_IMPORT_STATUSES } from './import';
import type { ImportKind, ImportRecord, ImportStatus, ImportWarning } from './import';
import { Import } from './import.entity';
import { ImportAlreadyRunningError, INTERRUPTED_ERROR } from './import.store';
import type { ImportPage, ImportPageQuery, ImportStore, ImportUpdate, NewImport } from './import.store';

function toRecord(entity: Import): ImportRecord {
  return {
    id: entity.id,
    locationId: entity.locationId,
    kind: entity.kind,
    status: entity.status,
    from: entity.fromDate,
    to: entity.toDate,
    overwriteCorrections: Boolean(entity.overwriteCorrections),
    requestedBy: entity.requestedBy,
    requestedAt: entity.requestedAt,
    startedAt: entity.startedAt,
    finishedAt: entity.finishedAt,
    counts: {
      inserted: entity.countInserted,
      updated: entity.countUpdated,
      unchanged: entity.countUnchanged,
      skippedCorrected: entity.countSkippedCorrected,
    },
    warnings: JSON.parse(entity.warningsJson) as ImportWarning[],
    error: entity.errorCode ? { code: entity.errorCode, message: entity.errorMessage ?? '' } : null,
  };
}

/** Geänderte Felder → Spalten; nur gesetzte Felder werden geschrieben. */
function toColumns(changes: ImportUpdate): Partial<Import> {
  const columns: Partial<Import> = {};
  if (changes.status !== undefined) columns.status = changes.status;
  if (changes.startedAt !== undefined) columns.startedAt = changes.startedAt;
  if (changes.finishedAt !== undefined) columns.finishedAt = changes.finishedAt;
  if (changes.counts !== undefined) {
    columns.countInserted = changes.counts.inserted;
    columns.countUpdated = changes.counts.updated;
    columns.countUnchanged = changes.counts.unchanged;
    columns.countSkippedCorrected = changes.counts.skippedCorrected;
  }
  if (changes.warnings !== undefined) columns.warningsJson = JSON.stringify(changes.warnings);
  if (changes.error !== undefined) {
    columns.errorCode = changes.error?.code ?? null;
    columns.errorMessage = changes.error?.message ?? null;
  }
  return columns;
}

/**
 * `ImportStore` auf SQLite (Schritt 9, Tabelle `import`), gleiches Token wie der In-Memory-Store. Importe
 * und ihre IDs überleben einen Neustart (F32). R19 prüft `create` vorher per Abfrage; zwei gleichzeitige
 * Anlagen fängt der partielle Unique-Index `UQ_import_active` ab.
 */
@Injectable()
export class TypeOrmImportStore implements ImportStore {
  constructor(@InjectRepository(Import) private readonly repository: Repository<Import>) {}

  async create(input: NewImport): Promise<ImportRecord> {
    const running = await this.findActive(input.locationId);
    if (running) throw new ImportAlreadyRunningError(running.id);
    if (input.from === null || input.to === null) {
      throw new Error('Import ohne Zeitraum (from/to) kann nicht gespeichert werden');
    }
    try {
      const saved = await this.repository.save(
        this.repository.create({
          locationId: input.locationId,
          kind: input.kind,
          status: 'queued',
          fromDate: input.from,
          toDate: input.to,
          overwriteCorrections: input.overwriteCorrections,
          requestedBy: input.requestedBy,
          requestedAt: input.requestedAt,
          startedAt: null,
          finishedAt: null,
          countInserted: input.counts.inserted,
          countUpdated: input.counts.updated,
          countUnchanged: input.counts.unchanged,
          countSkippedCorrected: input.counts.skippedCorrected,
          warningsJson: JSON.stringify(input.warnings),
          errorCode: null,
          errorMessage: null,
        }),
      );
      return toRecord(saved);
    } catch (error) {
      // R19: Zwischen Prüfung und Anlegen kam ein anderer Import dazu (partieller Unique-Index).
      if (isUniqueViolation(error)) {
        const active = await this.findActive(input.locationId);
        if (active) throw new ImportAlreadyRunningError(active.id);
      }
      throw error;
    }
  }

  async findById(id: number): Promise<ImportRecord | null> {
    const entity = await this.repository.findOneBy({ id });
    return entity ? toRecord(entity) : null;
  }

  async update(id: number, changes: ImportUpdate): Promise<ImportRecord | null> {
    const columns = toColumns(changes);
    if (Object.keys(columns).length > 0) await this.repository.update({ id }, columns);
    return this.findById(id);
  }

  async findPage(query: ImportPageQuery): Promise<ImportPage> {
    const [entities, total] = await this.repository.findAndCount({
      where: {
        locationId: query.locationId,
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.kind !== undefined ? { kind: query.kind } : {}),
      },
      order: { requestedAt: 'DESC', id: 'DESC' },
      skip: query.offset,
      take: query.limit,
    });
    return { items: entities.map(toRecord), total };
  }

  async findLastFinished(filter: {
    locationId: number;
    kinds: readonly ImportKind[];
    statuses: readonly ImportStatus[];
  }): Promise<ImportRecord | null> {
    const entity = await this.repository.findOne({
      where: {
        locationId: filter.locationId,
        kind: In([...filter.kinds]),
        status: In([...filter.statuses]),
        finishedAt: Not(IsNull()),
      },
      order: { finishedAt: 'DESC', id: 'DESC' },
    });
    return entity ? toRecord(entity) : null;
  }

  async markInterrupted(finishedAt: string): Promise<number[]> {
    const active = await this.repository.find({ where: { status: In([...ACTIVE_IMPORT_STATUSES]) }, order: { id: 'ASC' } });
    if (active.length === 0) return [];
    const ids = active.map(entity => entity.id);
    await this.repository.update(
      { id: In(ids) },
      { status: 'failed', finishedAt, errorCode: INTERRUPTED_ERROR.code, errorMessage: INTERRUPTED_ERROR.message },
    );
    return ids;
  }

  private findActive(locationId: number): Promise<Import | null> {
    return this.repository.findOne({
      where: { locationId, status: In([...ACTIVE_IMPORT_STATUSES]) },
      order: { id: 'ASC' },
    });
  }
}
