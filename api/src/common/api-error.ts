/**
 * Form der Fehlerantworten (03 B3.3). Services und Pipes werfen `ApiException` bzw.
 * `ApiValidationException` mit einem `ApiErrorPayload`; der globale `ApiExceptionFilter` ergänzt
 * `path`, `timestamp` und `requestId` und bildet alle übrigen Fehler auf dieselbe Form ab.
 */

/** Ein Fehler an einem Feld. `field` ist der Pfad im Body, Query oder Pfadparameter; `null` = ganzes Objekt. */
export interface ApiFieldError {
  field: string | null;
  /** Zod-Code (`unrecognized_keys`, `too_small`, `invalid_type` …) oder eigener Code (`invalid_date`, `to_before_from`, `range_too_long`). */
  code: string;
  message: string;
}

/** Feste `code`-Werte oben im Fehler (vollständige Liste aus B3.3). */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'DATE_IN_FUTURE',
  'NO_DATA',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'CONFLICT',
  'IMPORT_RUNNING',
  'OBSERVATION_IS_PREDICTION',
  'CORRECTION_NOT_REVERSIBLE',
  'PRECONDITION_FAILED',
  'PRECONDITION_REQUIRED',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Inhalt einer geworfenen `ApiException`: alles aus B3.3 außer den Angaben zur Anfrage. */
export interface ApiErrorPayload {
  statusCode: number;
  error: string;
  code: ApiErrorCode;
  message: string;
  /** Immer ein Array; leer bei Fehlern ohne Feldbezug. */
  errors: ApiFieldError[];
  details: Record<string, unknown> | null;
}

/** Vollständige Fehlerantwort (B3.3), Reihenfolge der Schlüssel wie dort. */
export interface ApiErrorBody extends ApiErrorPayload {
  /** Pfad der Anfrage ohne Query (`/api/days/2024-12-31`). */
  path: string;
  /** UTC ohne Millisekunden (`formatUtc`). */
  timestamp: string;
  /** Kurze Zufalls-ID der Anfrage, gleich dem Header `X-Request-Id`. */
  requestId: string;
}

/** Meldung bei 500: nie Fehlertext oder Stacktrace im Body (B3.3). */
export const INTERNAL_ERROR_MESSAGE = 'Interner Fehler';

/** Statustext je Statuscode (Feld `error`). */
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? (status >= 500 ? 'Internal Server Error' : 'Bad Request');
}

/** `code` für einen Statuscode ohne eigenen Fachcode (z. B. Nest-Exceptions, Router-404). */
export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
    case 405:
    case 410:
      return 'NOT_FOUND';
    case 406:
      return 'NOT_ACCEPTABLE';
    case 409:
      return 'CONFLICT';
    case 412:
      return 'PRECONDITION_FAILED';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 428:
      return 'PRECONDITION_REQUIRED';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}

/** Deutsche Standardmeldung je `code`, wenn der Fehler keine eigene hat (fremde Exceptions). */
const DEFAULT_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  VALIDATION_FAILED: 'Die Anfrage enthält ungültige Werte.',
  NOT_FOUND: 'Die angefragte Ressource gibt es nicht.',
  UNAUTHENTICATED: 'Anmeldung erforderlich.',
  FORBIDDEN: 'Keine Berechtigung für diese Anfrage.',
  NOT_ACCEPTABLE: 'Die API liefert nur application/json.',
  UNSUPPORTED_MEDIA_TYPE: 'Der Body muss application/json sein.',
  PAYLOAD_TOO_LARGE: 'Der Body ist größer als 64 KB.',
  CONFLICT: 'Die Anfrage steht im Konflikt mit dem aktuellen Stand.',
  PRECONDITION_FAILED: 'Die Ressource wurde inzwischen geändert.',
  PRECONDITION_REQUIRED: 'Der Header If-Match fehlt.',
  TOO_MANY_REQUESTS: 'Zu viele Anfragen. Bitte später erneut versuchen.',
  INTERNAL_ERROR: INTERNAL_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE: 'Der Dienst ist gerade nicht erreichbar.',
};

export function defaultMessage(code: ApiErrorCode): string {
  return DEFAULT_MESSAGES[code] ?? 'Die Anfrage enthält ungültige Werte.';
}

/** Erkennt den Inhalt einer eigenen Exception (`ApiException`, `ApiValidationException`). */
export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['statusCode'] === 'number' &&
    typeof v['code'] === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(v['code']) &&
    typeof v['message'] === 'string' &&
    Array.isArray(v['errors'])
  );
}

/** `DD.MM.YYYY` aus `YYYY-MM-DD` (nur für Meldungen). */
export function formatDateDe(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
