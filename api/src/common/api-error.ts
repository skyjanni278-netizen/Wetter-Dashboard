/**
 * Form der Fehlerantworten (03 B3.3). Schritt 4 liefert sie für Validierungsfehler (400);
 * `path`, `timestamp` und `requestId` ergänzt der globale `ApiExceptionFilter` in Schritt 5.
 */

/** Ein Fehler an einem Feld. `field` ist der Pfad im Body, Query oder Pfadparameter; `null` = ganzes Objekt. */
export interface ApiFieldError {
  field: string | null;
  /** Zod-Code (`unrecognized_keys`, `too_small`, `invalid_type` …) oder eigener Code (`invalid_date`, `to_before_from`, `range_too_long`). */
  code: string;
  message: string;
}

/** Feste `code`-Werte oben im Fehler, soweit Schritt 4 sie verwendet (vollständige Liste: B3.3). */
export type ApiErrorCode = 'VALIDATION_FAILED' | 'DATE_IN_FUTURE';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: ApiErrorCode;
  message: string;
  errors: ApiFieldError[];
  details: Record<string, unknown> | null;
}
