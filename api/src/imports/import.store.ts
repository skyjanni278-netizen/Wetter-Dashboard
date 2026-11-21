import type { ImportKind, ImportRecord, ImportStatus } from './import';

/** DI-Token für den `ImportStore` (Schritt 3: In-Memory, Schritt 9: TypeORM, Tabelle `import`). */
export const IMPORT_STORE = 'IMPORT_STORE';

/** Felder, die beim Anlegen feststehen; `id` und `status = "queued"` vergibt der Store. */
export type NewImport = Omit<ImportRecord, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'error'>;

/** Änderbare Felder eines Imports. */
export type ImportUpdate = Partial<
  Pick<ImportRecord, 'status' | 'startedAt' | 'finishedAt' | 'counts' | 'warnings' | 'error'>
>;

/** Filter und Seite für `findPage` (Schritt 9: `WHERE … ORDER BY requested_at DESC, id DESC LIMIT … OFFSET …`). */
export interface ImportPageQuery {
  locationId: number;
  status?: ImportStatus;
  kind?: ImportKind;
  /** Anzahl übersprungener Einträge (`(page - 1) * limit`). */
  offset: number;
  limit: number;
}

export interface ImportPage {
  items: ImportRecord[];
  total: number;
}

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

  /**
   * Eine Seite der Importe eines Standorts (US11-2, R24), optional gefiltert nach Status und Art, sortiert
   * nach `requestedAt` absteigend (bei Gleichstand nach `id` absteigend). `total` zählt alle Treffer des
   * Filters über alle Seiten; eine Seite hinter dem Ende liefert `items = []`.
   */
  findPage(query: ImportPageQuery): Promise<ImportPage>;

  /** Der zuletzt abgeschlossene Import (nach `finishedAt`) mit passender Art und passendem Status. */
  findLastFinished(filter: {
    locationId: number;
    kinds: readonly ImportKind[];
    statuses: readonly ImportStatus[];
  }): Promise<ImportRecord | null>;

  /**
   * R19, beim Start: Importe, die noch `queued`/`running` sind, wurden durch einen Neustart unterbrochen.
   * Sie werden `failed` mit `error.code = "INTERRUPTED"` und `finishedAt`. Liefert ihre IDs.
   */
  markInterrupted(finishedAt: string): Promise<number[]>;
}

/** Fehlercode eines durch Neustart unterbrochenen Imports (R19). */
export const INTERRUPTED_ERROR = {
  code: 'INTERRUPTED',
  message: 'Der Import wurde durch einen Neustart unterbrochen.',
} as const;
