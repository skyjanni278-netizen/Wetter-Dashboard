import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Response-Header mit der ID der Anfrage (gleich `requestId` im Fehlerformat, B3.3). */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Kurze Zufalls-ID (8 Hex-Zeichen), z. B. `b6f1c0d2`. */
export function newRequestId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * ID der Anfrage aus `res.locals`; fehlt sie (Middleware nicht durchlaufen), entsteht sie hier und
 * wird, solange noch möglich, als `X-Request-Id` gesetzt. Eine ID vom Client wird nicht übernommen.
 */
export function requestIdOf(res: Response): string {
  const locals = (res.locals ?? {}) as Record<string, unknown>;
  const existing = locals['requestId'];
  if (typeof existing === 'string') return existing;
  const id = newRequestId();
  if (res.locals) res.locals['requestId'] = id;
  if (!res.headersSent) res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Erste Middleware: vergibt die ID und setzt den Header für jede Antwort, auch bei Erfolg. */
export function requestIdMiddleware(_req: Request, res: Response, next: NextFunction): void {
  requestIdOf(res);
  next();
}
