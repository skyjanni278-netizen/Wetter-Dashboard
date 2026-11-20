import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  codeForStatus,
  defaultMessage,
  INTERNAL_ERROR_MESSAGE,
  isApiErrorPayload,
  statusText,
} from './api-error';
import type { ApiErrorBody, ApiErrorPayload } from './api-error';
import { bodyParserException } from './body-parser';
import { Clock } from './clock';
import { requestIdOf } from './request-id';
import { formatUtc } from './utc';

/** Fehlerinhalt nur aus dem Statuscode (fremde Exceptions): fester `code`, deutsche Standardmeldung. */
function payloadForStatus(status: number): ApiErrorPayload {
  const code = codeForStatus(status);
  return {
    statusCode: status,
    error: statusText(status),
    code,
    message: status >= 500 ? INTERNAL_ERROR_MESSAGE : defaultMessage(code),
    errors: [],
    details: null,
  };
}

/** Verletzung einer Unique-Regel der DB (better-sqlite3 direkt oder als TypeORM `QueryFailedError.driverError`). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidates = [error, (error as { driverError?: unknown }).driverError];
  return candidates.some(c => {
    const code = typeof c === 'object' && c !== null ? (c as { code?: unknown }).code : undefined;
    return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
  });
}

/**
 * Bildet jede Exception auf den Inhalt des Fehlerformats (B3.3) ab:
 * - eigene (`ApiException`, `ApiValidationException`) → ihr Inhalt unverändert;
 * - andere `HttpException` (Router-404, Nest-Pipes …) → Status bleibt, `code` und Meldung fest je Status;
 * - Body-Parser-Fehler → 400/413/415; Unique-Verletzung der DB → 409 `CONFLICT`;
 * - alles andere → 500 `INTERNAL_ERROR`.
 * Bei 500 steht immer nur „Interner Fehler“ im Body, ohne Felder und Details.
 */
export function toErrorPayload(exception: unknown): ApiErrorPayload {
  let payload: ApiErrorPayload;
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    payload = isApiErrorPayload(response)
      ? {
          statusCode: exception.getStatus(),
          error: response.error,
          code: response.code,
          message: response.message,
          errors: response.errors,
          details: response.details ?? null,
        }
      : payloadForStatus(exception.getStatus());
  } else {
    const parser = bodyParserException(exception);
    if (parser) {
      payload = parser.payload;
    } else if (isUniqueViolation(exception)) {
      payload = payloadForStatus(409);
    } else {
      payload = payloadForStatus(500);
    }
  }
  return payload.statusCode === 500 ? payloadForStatus(500) : payload;
}

/** Text und Stacktrace für das Log (nie für den Body). */
function describe(exception: unknown): { text: string; stack?: string } {
  if (exception instanceof Error) {
    return { text: `${exception.name}: ${exception.message}`, stack: exception.stack };
  }
  return { text: String(exception) };
}

/**
 * Der eine globale Filter (03 B3.3, als `APP_FILTER` registriert) für **alle** Exceptions aus
 * Middleware, Guards, Pipes, Controllern, Services und dem Router (`@Catch()` ohne Typ). Ergänzt
 * `path`, `timestamp` (UTC ohne ms) und `requestId`. Fehler ab 500 gehen mit `requestId` ins Log.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly clock: Clock) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(res);
    const payload = toErrorPayload(exception);
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';

    if (payload.statusCode >= 500) {
      const { text, stack } = describe(exception);
      this.logger.error(`[${requestId}] ${req.method} ${path} → ${payload.statusCode}: ${text}`, stack);
    }
    if (res.headersSent) {
      this.logger.warn(`[${requestId}] Antwort schon gesendet, Fehler ${payload.code} nicht zustellbar`);
      return;
    }

    const body: ApiErrorBody = {
      statusCode: payload.statusCode,
      error: payload.error,
      code: payload.code,
      message: payload.message,
      errors: payload.errors,
      path,
      timestamp: formatUtc(this.clock.now()),
      requestId,
      details: payload.details,
    };
    res.status(payload.statusCode).json(body);
  }
}
