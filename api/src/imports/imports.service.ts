import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { HEUBACH } from '../locations/location';
import type { CreateImportInput } from './create-import.input';
import { emptyCounts } from './import';
import type { ImportRecord } from './import';
import { ImportRunner } from './import-runner';
import { IMPORT_STORE, ImportAlreadyRunningError } from './import.store';
import type { ImportStore } from './import.store';

/** US10-3, US11-1: Importaufträge anlegen und abfragen; R19 (höchstens ein laufender Import). */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_STORE) private readonly store: ImportStore,
    private readonly runner: ImportRunner,
    private readonly clock: Clock,
  ) {}

  /** Legt den Auftrag mit `queued` an und startet ihn danach (`setImmediate`), ohne darauf zu warten. */
  async create(input: CreateImportInput): Promise<ImportRecord> {
    let record: ImportRecord;
    try {
      record = await this.store.create({
        locationId: HEUBACH.id,
        kind: input.kind,
        from: input.from,
        to: input.to,
        overwriteCorrections: false,
        requestedBy: null,
        requestedAt: formatUtc(this.clock.now()),
        counts: emptyCounts(),
        warnings: [],
      });
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) {
        // Einheitliches Fehlerformat (`code = "IMPORT_RUNNING"`) folgt in Schritt 5.
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Es läuft bereits ein Import',
          runningImportId: error.runningImportId,
        });
      }
      throw error;
    }
    this.runner.schedule(record.id);
    return record;
  }

  async findOne(id: number): Promise<ImportRecord> {
    const record = await this.store.findById(id);
    if (!record) {
      throw new NotFoundException(`Import ${id} nicht gefunden`);
    }
    return record;
  }
}
