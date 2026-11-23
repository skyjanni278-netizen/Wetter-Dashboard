import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { isDocsPath } from '../openapi/docs-path';
import { defaultMessage } from './api-error';
import { ApiException } from './api.exception';

/** Medientypen, die `Accept` erlauben muss, damit die API antwortet (nur JSON, 03 B3.2). */
const ACCEPTABLE_RANGES = new Set(['application/json', 'application/*', '*/*']);

/**
 * Erlaubte Body-Typen je Methode (B3.2): POST `application/json`; PATCH `application/merge-patch+json`
 * (RFC 7396) oder `application/json` (Schritt 12a, 04 Roadmap: beide mit derselben Merge-Patch-Bedeutung).
 */
const BODY_TYPES: Record<string, readonly string[]> = {
  POST: ['application/json'],
  PATCH: ['application/merge-patch+json', 'application/json'],
};

/** Medientyp ohne Parameter, klein geschrieben (`application/json; charset=utf-8` → `application/json`). */
function mediaTypeOf(value: string): string {
  return value.split(';')[0]!.trim().toLowerCase();
}

/** q-Wert eines Eintrags im `Accept`-Header (fehlt = 1). */
function qualityOf(entry: string): number {
  const match = /;\s*q\s*=\s*([0-9.]+)/i.exec(entry);
  if (!match) return 1;
  const q = Number.parseFloat(match[1]!);
  return Number.isNaN(q) ? 1 : q;
}

/** Fehlt `Accept` oder ist er leer, ist JSON erlaubt; sonst muss ein Eintrag mit q > 0 JSON abdecken. */
export function acceptsJson(accept: string | undefined): boolean {
  if (accept === undefined || accept.trim() === '') return true;
  return accept
    .split(',')
    .some(entry => ACCEPTABLE_RANGES.has(mediaTypeOf(entry)) && qualityOf(entry) > 0);
}

/** Wie `type-is`: Ein Body ist da, wenn `Transfer-Encoding` gesetzt oder `Content-Length` größer 0 ist. */
export function hasBody(headers: IncomingHttpHeaders): boolean {
  if (headers['transfer-encoding'] !== undefined) return true;
  const length = headers['content-length'];
  return length !== undefined && length !== '' && Number(length) !== 0;
}

/** `null`, wenn die Anfrage passt, sonst 406 bzw. 415 als `ApiException`. */
export function contentNegotiationError(method: string, headers: IncomingHttpHeaders): ApiException | null {
  if (!acceptsJson(headers.accept)) {
    return new ApiException(406, 'NOT_ACCEPTABLE', defaultMessage('NOT_ACCEPTABLE'));
  }
  const expected = BODY_TYPES[method.toUpperCase()];
  if (expected !== undefined && hasBody(headers)) {
    const contentType = headers['content-type'];
    if (contentType === undefined || !expected.includes(mediaTypeOf(contentType))) {
      return new ApiException(415, 'UNSUPPORTED_MEDIA_TYPE', `Der Body muss ${expected.join(' oder ')} sein.`);
    }
  }
  return null;
}

/**
 * 03 B4.3: läuft vor dem Body-Parser und vor allen Guards (in `configureApp` registriert).
 * `Accept` ohne `application/json`, `application/*` oder `*\/*` → 406 `NOT_ACCEPTABLE`;
 * POST/PATCH mit Body im falschen Typ → 415 `UNSUPPORTED_MEDIA_TYPE`. Die Antwort baut der Filter.
 * Ausgenommen sind die Pfade der Doku (`/api/docs*`), weil die Swagger UI HTML ist (B3.1), aber **nur**, wenn
 * Swagger an ist (`docsEnabled`, aus `SWAGGER_ENABLED`); sonst gelten sie wie jeder unbekannte Pfad.
 */
@Injectable()
export class ContentNegotiationMiddleware implements NestMiddleware<Request, Response> {
  constructor(private readonly docsEnabled: boolean = false) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (this.docsEnabled && isDocsPath(req.path)) {
      next();
      return;
    }
    const error = contentNegotiationError(req.method, req.headers);
    if (error) {
      next(error);
      return;
    }
    next();
  }
}
