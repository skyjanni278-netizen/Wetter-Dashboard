import type { NextFunction, Request, Response } from 'express';
import { isDocsPath } from '../openapi/docs-path';

/** Ressourcen, die sich höchstens stündlich ändern und kurz zwischengespeichert werden dürfen (03 B4.5). */
export const SHORT_CACHE_PATHS: readonly string[] = ['/api/forecasts', '/api/status'];

export const SHORT_CACHE = 'max-age=60';
/** Der Browser fragt jedes Mal nach; mit dem ETag von Express antwortet der Server dann 304 ohne Body. */
export const REVALIDATE = 'no-cache';

/** `Cache-Control` je Pfad (B4.5): `/api/forecasts` und `/api/status` `max-age=60`, sonst `no-cache`. */
export function cacheControlFor(path: string): string {
  return SHORT_CACHE_PATHS.some(p => path === p || path.startsWith(`${p}/`)) ? SHORT_CACHE : REVALIDATE;
}

/**
 * Setzt `Cache-Control` für `GET`/`HEAD` unter `/api` (03 B4.5). Den schwachen `ETag` und die Antwort 304
 * bei passendem `If-None-Match` übernimmt Express selbst. Die Swagger-Doku bleibt unberührt.
 */
export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/api/') && !isDocsPath(req.path)) {
    res.setHeader('Cache-Control', cacheControlFor(req.path));
  }
  next();
}
