import { HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import type { ApiError, ApiFieldError } from '../models/api';

/** Meldung, wenn keine Antwort kam (Netzwerk) oder der Proxy/Server nicht erreichbar ist (V20). */
export const UNREACHABLE_MESSAGE = 'Server nicht erreichbar.';
/** Meldung bei 500 (B3.3: nie Fehlertext des Servers). */
export const INTERNAL_MESSAGE = 'Interner Fehler';
const FALLBACK_MESSAGE = 'Die Anfrage konnte nicht verarbeitet werden.';

/** `code` aus B3.3 für einen Status ohne B3.3-Body (Express, Proxy, Netzwerk). */
export function codeForStatus(status: number): string {
  switch (status) {
    case 0:
    case 502:
    case 503:
    case 504:
      return 'SERVICE_UNAVAILABLE';
    case 401: return 'UNAUTHENTICATED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 406: return 'NOT_ACCEPTABLE';
    case 409: return 'CONFLICT';
    case 412: return 'PRECONDITION_FAILED';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    case 428: return 'PRECONDITION_REQUIRED';
    case 429: return 'TOO_MANY_REQUESTS';
    default: return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}

function isFieldError(value: unknown): value is ApiFieldError {
  if (typeof value !== 'object' || value === null) return false;
  const { field, code, message } = value as Record<string, unknown>;
  return (field === null || typeof field === 'string') && typeof code === 'string' && typeof message === 'string';
}

/** Ist der Body eine Fehlerantwort nach B3.3 (`statusCode`, `code`, `message`, `errors[]`)? */
export function isApiErrorBody(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['statusCode'] === 'number' &&
    typeof b['code'] === 'string' &&
    typeof b['message'] === 'string' &&
    Array.isArray(b['errors']) &&
    b['errors'].every(isFieldError)
  );
}

/** Text aus einem Fehler-Body, der nicht B3.3 ist: Express `{ error: "…" }` oder `{ message: "…" }`. */
function legacyMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { error, message } = body as Record<string, unknown>;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof message === 'string' && message.trim()) return message;
  return null;
}

/**
 * Übersetzt eine `HttpErrorResponse` in ein `ApiError`:
 * - Body nach B3.3 → unverändert (mit `errors = []` und `details = null` als Rückfall);
 * - Express-Body `{ error }` → Status bleibt, `code` je Status, `message` = Text von Express;
 * - kein Status (Netzwerk), 502/503/504 (z. B. Proxy ohne Ziel) → `SERVICE_UNAVAILABLE`, „Server nicht erreichbar.“;
 * - andere 5xx ohne B3.3 → `INTERNAL_ERROR`, „Interner Fehler“ (Text des Servers wird nie gezeigt).
 */
export function toApiError(response: HttpErrorResponse): ApiError {
  const body = response.error;
  if (isApiErrorBody(body)) {
    return { ...body, errors: body.errors, details: body.details ?? null };
  }
  const status = response.status;
  const code = codeForStatus(status);
  let message: string;
  if (code === 'SERVICE_UNAVAILABLE') {
    message = UNREACHABLE_MESSAGE;
  } else if (status >= 500) {
    message = INTERNAL_MESSAGE;
  } else {
    message = legacyMessage(body) ?? FALLBACK_MESSAGE;
  }
  return {
    statusCode: status,
    error: response.statusText || (status === 0 ? 'Unknown Error' : 'Error'),
    code,
    message,
    errors: [],
    details: null,
  };
}

/**
 * `HttpErrorResponse` mit dem übersetzten Fehler in `apiError`. Status, Header und der
 * ursprüngliche Body (`error`) bleiben unverändert, damit Seiten, die heute nach `status` und
 * `error.error` unterscheiden (V20), genauso weiterarbeiten.
 */
export class ApiErrorResponse extends HttpErrorResponse {
  readonly apiError: ApiError;

  constructor(source: HttpErrorResponse) {
    super({
      error: source.error,
      headers: source.headers,
      status: source.status,
      statusText: source.statusText,
      url: source.url ?? undefined,
    });
    this.apiError = toApiError(source);
  }
}

/** `ApiError` aus einem beliebigen Fehler (mit oder ohne Interceptor, auch Nicht-HTTP-Fehler). */
export function apiErrorOf(error: unknown): ApiError {
  if (error instanceof ApiErrorResponse) return error.apiError;
  if (error instanceof HttpErrorResponse) return toApiError(error);
  return {
    statusCode: 0,
    error: 'Unknown Error',
    code: 'SERVICE_UNAVAILABLE',
    message: UNREACHABLE_MESSAGE,
    errors: [],
    details: null,
  };
}

/** Wandelt jede HTTP-Fehlerantwort in eine `ApiErrorResponse` (mit `apiError`) um (B5.2). */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof HttpErrorResponse && !(error instanceof ApiErrorResponse) ? new ApiErrorResponse(error) : error,
      ),
    ),
  );
