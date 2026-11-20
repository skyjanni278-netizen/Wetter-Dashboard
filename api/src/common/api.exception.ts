import { HttpException } from '@nestjs/common';
import { formatDateDe, statusText } from './api-error';
import type { ApiErrorCode, ApiErrorPayload, ApiFieldError } from './api-error';

export interface ApiExceptionOptions {
  errors?: ApiFieldError[];
  details?: Record<string, unknown> | null;
  cause?: unknown;
}

/**
 * Fachfehler mit festem `code` (03 B3.3), z. B. `NO_DATA`, `NOT_FOUND`, `IMPORT_RUNNING`.
 * Der globale `ApiExceptionFilter` ergänzt `path`, `timestamp` und `requestId`.
 * Validierungsfehler (400 mit `errors[]`) wirft `ApiValidationException`.
 */
export class ApiException extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, options: ApiExceptionOptions = {}) {
    const body: ApiErrorPayload = {
      statusCode: status,
      error: statusText(status),
      code,
      message,
      errors: options.errors ?? [],
      details: options.details ?? null,
    };
    super(body, status, options.cause === undefined ? undefined : { cause: options.cause });
  }

  get payload(): ApiErrorPayload {
    return this.getResponse() as ApiErrorPayload;
  }

  /** 404 für eine unbekannte Ressource (Standort, Import …). */
  static notFound(message: string): ApiException {
    return new ApiException(404, 'NOT_FOUND', message);
  }

  /**
   * R03 (US02-5): Tag ohne einzige Stunde → 404 `NO_DATA` mit `details.dataFrom` (erster Tag mit
   * Daten oder `null`, wenn es noch gar keine gibt). Die Meldung nennt den Datenbeginn als `DD.MM.YYYY`.
   */
  static noData(date: string, dataFrom: string | null): ApiException {
    const base = `Für den ${formatDateDe(date)} liegen keine Daten vor.`;
    const message = dataFrom === null ? base : `${base} Daten gibt es ab ${formatDateDe(dataFrom)}.`;
    return new ApiException(404, 'NO_DATA', message, { details: { dataFrom } });
  }

  /** R19 (US10-7): zweiter Import, während einer `queued`/`running` ist → 409 `IMPORT_RUNNING`. */
  static importRunning(runningImportId: number): ApiException {
    return new ApiException(409, 'IMPORT_RUNNING', `Es läuft bereits ein Import (Nr. ${runningImportId}).`, {
      details: { runningImportId },
    });
  }
}
