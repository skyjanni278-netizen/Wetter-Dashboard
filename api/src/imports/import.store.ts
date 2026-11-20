import type { ImportKind, ImportRecord, ImportStatus } from './import';

/** DI-Token für den `ImportStore` (Schritt 3: In-Memory, Schritt 9: TypeORM, Tabelle `import`). */
export const IMPORT_STORE = 'IMPORT_STORE';

/** Felder, die beim Anlegen feststehen; `id` und `status = "queued"` vergibt der Store. */
export type NewImport = Omit<ImportRecord, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'error'>;

/** Änderbare Felder eines Imports. */
export type ImportUpdate = Partial<
  Pick<ImportRecord, 'status' | 'startedAt' | 'finishedAt' | 'counts' | 'warnings' | 'error'>
>;

/** R19: Beim Anlegen läuft schon ein Import (`queued` oder `running`). */
export class ImportAlreadyRunningError extends Error {
  constructor(readonly runningImportId: number) {
    super(`Import ${runningImportId} läuft bereits`);
    this.name = 'ImportAlreadyRunningError';
  }
}

export interface ImportStore {
  /**
   * Legt einen Import mit `status = "queued"` an. Läuft für den Standort schon einer, wirft der Store
   * `ImportAlreadyRunningError` (R19; Prüfen und Anlegen in einem Schritt, in Schritt 9 per Unique-Index).
   */
  create(input: NewImport): Promise<ImportRecord>;

  findById(id: number): Promise<ImportRecord | null>;

  /** Ändert einen Import und liefert den neuen Stand; `null`, wenn es ihn nicht gibt. */
  update(id: number, changes: ImportUpdate): Promise<ImportRecord | null>;

  /** Der zuletzt abgeschlossene Import (nach `finishedAt`) mit passender Art und passendem Status. */
  findLastFinished(filter: {
    locationId: number;
    kinds: readonly ImportKind[];
    statuses: readonly ImportStatus[];
  }): Promise<ImportRecord | null>;
}
