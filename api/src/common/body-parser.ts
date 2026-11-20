import type { NextFunction, Request, Response } from 'express';
import { codeForStatus, defaultMessage } from './api-error';
import { ApiException } from './api.exception';

/** Höchstgröße eines JSON-Bodys (03 B3.2, C1 A06). */
export const JSON_BODY_LIMIT = '64kb';

/** Diese Typen liest der JSON-Parser; andere Bodys weist vorher die `ContentNegotiationMiddleware` ab. */
export const JSON_MEDIA_TYPES = ['application/json', 'application/merge-patch+json'];

interface BodyParserError {
  type: string;
  status: number;
}

/** Fehler von `express.json()` (body-parser, http-errors): `type` wie `entity.too.large` und ein 4xx-Status. */
function isBodyParserError(error: unknown): error is BodyParserError {
  if (!(error instanceof Error)) return false;
  const e = error as Error & { type?: unknown; status?: unknown };
  return typeof e.type === 'string' && typeof e.status === 'number';
}

/**
 * Bildet Fehler des Body-Parsers auf das Fehlerformat ab: zu groß → 413 `PAYLOAD_TOO_LARGE`,
 * kaputtes JSON → 400 `VALIDATION_FAILED`, Zeichensatz/Kodierung nicht unterstützt → 415.
 * Andere Fehler → `null`. Der Fehlertext des Parsers erscheint nie im Body.
 */
export function bodyParserException(error: unknown): ApiException | null {
  if (!isBodyParserError(error)) return null;
  switch (error.type) {
    case 'entity.too.large':
      return new ApiException(413, 'PAYLOAD_TOO_LARGE', defaultMessage('PAYLOAD_TOO_LARGE'), { cause: error });
    case 'entity.parse.failed':
      return new ApiException(400, 'VALIDATION_FAILED', 'Der Body ist kein gültiges JSON.', { cause: error });
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new ApiException(415, 'UNSUPPORTED_MEDIA_TYPE', 'Zeichensatz oder Kodierung des Bodys wird nicht unterstützt.', {
        cause: error,
      });
    default: {
      if (error.status < 400 || error.status >= 500) return null;
      const code = codeForStatus(error.status);
      return new ApiException(error.status, code, defaultMessage(code), { cause: error });
    }
  }
}

/** Fehler-Middleware direkt nach dem JSON-Parser: reicht Parser-Fehler als `ApiException` an den Filter weiter. */
export function bodyParserErrorMiddleware(error: unknown, _req: Request, _res: Response, next: NextFunction): void {
  next(bodyParserException(error) ?? error);
}
