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
    return ApiException.noDataFor(`den ${formatDateDe(date)}`, dataFrom);
  }

  /**
   * R03 (US04-5, US05-5): Monat oder Jahr ohne einzige Stunde → 404 `NO_DATA` wie bei Tagen.
   * `period` ist der Text nach „Für“, z. B. „Dezember 2024“ oder „das Jahr 2024“.
   */
  static noDataFor(period: string, dataFrom: string | null): ApiException {
    const base = `Für ${period} liegen keine Daten vor.`;
    const message = dataFrom === null ? base : `${base} Daten gibt es ab ${formatDateDe(dataFrom)}.`;
    return new ApiException(404, 'NO_DATA', message, { details: { dataFrom } });
  }

  /** R17 (US13-4, US13-18): `If-Match` passt nicht zur aktuellen Version → 412 `PRECONDITION_FAILED`. */
  static preconditionFailed(version: number): ApiException {
    return new ApiException(
      412,
      'PRECONDITION_FAILED',
      `Der Wert wurde inzwischen geändert (aktuelle Version ${version}). Bitte neu laden.`,
    );
  }

  /** R08 (US13-8): Korrektur einer Vorhersagestunde → 409 `OBSERVATION_IS_PREDICTION`. */
  static observationIsPrediction(id: number): ApiException {
    return new ApiException(
      409,
      'OBSERVATION_IS_PREDICTION',
      `Die Stunde ${id} ist eine Vorhersage und kann nicht korrigiert werden.`,
    );
  }

  /** R33 (US13-17): Rücknahme nicht möglich → 409 `CORRECTION_NOT_REVERSIBLE`; `reason` nennt den Grund. */
  static correctionNotReversible(correctionId: number, reason: string): ApiException {
    return new ApiException(
      409,
      'CORRECTION_NOT_REVERSIBLE',
      `Die Korrektur ${correctionId} kann nicht zurückgenommen werden: ${reason}`,
    );
  }

  /** R19 (US10-7): zweiter Import, während einer `queued`/`running` ist → 409 `IMPORT_RUNNING`. */
  static importRunning(runningImportId: number): ApiException {
    return new ApiException(409, 'IMPORT_RUNNING', `Es läuft bereits ein Import (Nr. ${runningImportId}).`, {
      details: { runningImportId },
    });
  }
}
