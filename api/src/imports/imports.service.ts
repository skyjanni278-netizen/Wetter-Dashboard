import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { assertNotInFuture } from '../common/api-validation.exception';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { HEUBACH } from '../locations/location';
import type { ImportCreateDto } from './dto/import-create.schema';
import type { ImportsQuery } from './dto/imports-query.schema';
import { emptyCounts, toImportResource } from './import';
import type { ImportKind, ImportList, ImportRecord } from './import';
import { ImportRunner } from './import-runner';
import { IMPORT_STORE, ImportAlreadyRunningError } from './import.store';
import type { ImportStore } from './import.store';

/** US10-3, US11-1/-2: Importaufträge anlegen und abfragen; R19 (höchstens ein laufender Import). */
@Injectable()
export class ImportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @Inject(IMPORT_STORE) private readonly store: ImportStore,
    private readonly runner: ImportRunner,
    private readonly clock: Clock,
  ) {}

  /** R19: Beim Start kann kein Import mehr laufen. Was noch `queued`/`running` ist, wurde unterbrochen. */
  async onApplicationBootstrap(): Promise<void> {
    await this.recoverInterrupted();
  }

  /** Setzt hängengebliebene Läufe auf `failed` mit `INTERRUPTED` (R19) und liefert ihre IDs. */
  async recoverInterrupted(): Promise<number[]> {
    const ids = await this.store.markInterrupted(formatUtc(this.clock.now()));
    if (ids.length > 0) {
      this.logger.warn(`Unterbrochene Importe auf failed (INTERRUPTED) gesetzt: ${ids.join(', ')}`);
    }
    return ids;
  }

  /**
   * Legt den Auftrag mit `queued` an und startet ihn danach (`setImmediate`), ohne darauf zu warten.
   * Form, Reihenfolge und Spanne (R18) prüft vorher `ImportCreateSchema`; hier R02: `to` nach dem
   * Berliner Heute → 400 `DATE_IN_FUTURE` am Feld `to` (US10-5). `overwriteCorrections` wird bis zu
   * den Korrekturen (Schritt 12a) angenommen, aber als `false` gespeichert.
   */
  async create(input: ImportCreateDto): Promise<ImportRecord> {
    assertNotInFuture('to', input.to, localDate(this.clock.now()));
    try {
      return await this.start(input.kind, input.from, input.to);
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) {
        throw ApiException.importRunning(error.runningImportId);
      }
      throw error;
    }
  }

  /**
   * Für den `SchedulerService` (US08): legt einen Import `kind = "scheduled"` an und startet ihn wie
   * `create`. Über HTTP ist `scheduled` nicht erlaubt (`ImportCreateSchema`). Läuft schon ein Import,
   * wirft der Store `ImportAlreadyRunningError` (R19); der Aufrufer entscheidet, was dann geschieht.
   */
  async createScheduled(from: string, to: string): Promise<ImportRecord> {
    return this.start('scheduled', from, to);
  }

  /** Auftrag `queued` anlegen (R19 prüft der Store beim Anlegen), danach den Lauf anstoßen. */
  private async start(kind: ImportKind, from: string, to: string): Promise<ImportRecord> {
    const record = await this.store.create({
      locationId: HEUBACH.id,
      kind,
      from,
      to,
      overwriteCorrections: false,
      requestedBy: null,
      requestedAt: formatUtc(this.clock.now()),
      counts: emptyCounts(),
      warnings: [],
    });
    this.runner.schedule(record.id);
    return record;
  }

  /**
   * US11-2 (R24): eine Seite des Protokolls, nach `requestedAt` absteigend. Grenzen und Standardwerte von
   * `page`/`limit` setzt vorher `ImportsQuerySchema`; eine Seite hinter dem Ende ergibt `items = []`.
   */
  async findPage(query: ImportsQuery): Promise<ImportList> {
    const { page, limit, status, kind } = query;
    const result = await this.store.findPage({
      locationId: HEUBACH.id,
      status,
      kind,
      offset: (page - 1) * limit,
      limit,
    });
    return { items: result.items.map(toImportResource), meta: { page, limit, total: result.total } };
  }

  async findOne(id: number): Promise<ImportRecord> {
    const record = await this.store.findById(id);
    if (!record) {
      throw ApiException.notFound(`Den Import ${id} gibt es nicht.`);
    }
    return record;
  }
}
