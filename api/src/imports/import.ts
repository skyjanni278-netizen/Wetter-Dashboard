/**
 * Import nach 03 B2.2 (Ressource `import`). `requestedBy` bleibt bis zur Anmeldung (Schritt 10) `null`,
 * `overwriteCorrections` bis zu den Korrekturen (Schritt 12a) `false`.
 */
export type ImportKind = 'legacy' | 'range' | 'gaps' | 'scheduled';
export type ImportStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

/** Status, in denen ein Import noch nicht abgeschlossen ist (R19). */
export const ACTIVE_IMPORT_STATUSES: readonly ImportStatus[] = ['queued', 'running'];

export interface ImportCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  /** R20: korrigierte Stunden werden nicht überschrieben. Korrekturen gibt es erst ab Schritt 12a. */
  skippedCorrected: number;
}

export interface ImportWarning {
  code: string;
  message: string;
  timeUtc?: string;
}

/** Fehler eines Imports, ohne Stacktrace (z. B. `UPSTREAM_INVALID`, `UPSTREAM_TIMEOUT`). */
export interface ImportError {
  code: string;
  message: string;
}

export interface ImportRecord {
  id: number;
  locationId: number;
  kind: ImportKind;
  status: ImportStatus;
  from: string | null;
  to: string | null;
  overwriteCorrections: boolean;
  requestedBy: number | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  counts: ImportCounts;
  warnings: ImportWarning[];
  error: ImportError | null;
}

/** Antwort von `GET /api/imports/:id` und `POST /api/imports` (B2.2). */
export interface ImportResource extends ImportRecord {
  links: { self: string };
}

export function importPath(id: number): string {
  return `/api/imports/${id}`;
}

/** Feste Reihenfolge der Felder wie in B2.2. */
export function toImportResource(record: ImportRecord): ImportResource {
  return {
    id: record.id,
    locationId: record.locationId,
    kind: record.kind,
    status: record.status,
    from: record.from,
    to: record.to,
    overwriteCorrections: record.overwriteCorrections,
    requestedBy: record.requestedBy,
    requestedAt: record.requestedAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    counts: { ...record.counts },
    warnings: record.warnings.map(w => ({ ...w })),
    error: record.error ? { ...record.error } : null,
    links: { self: importPath(record.id) },
  };
}

export function emptyCounts(): ImportCounts {
  return { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 };
}
