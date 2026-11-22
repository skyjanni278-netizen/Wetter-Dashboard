import type { NextFunction, Request, Response } from 'express';
import { isDocsPath } from '../../src/openapi/docs-path';

/**
 * Netz für 03 B4.6 („Ein e2e-Test durchsucht **jede** Antwort nach `password`“): `createTestApp` hängt
 * `passwordScanMiddleware` vor alle anderen Middlewares, sie prüft jede JSON-Antwort jeder e2e-App;
 * `no-password-leaks.ts` (Jest `setupFilesAfterEnv`) lässt die Testdatei scheitern, wenn eine Antwort auffällt.
 * Ausgenommen ist nur die OpenAPI-Doku (`/api/docs*`), die das Login-Schema mit dem Feld `password` beschreibt.
 */

export interface PasswordFinding {
  method: string;
  path: string;
  status: number;
  /** JSON-Pfad der Fundstelle, z. B. `user.passwordHash` oder `items.0.note`. */
  at: string;
}

const BCRYPT_HASH = /\$2[aby]\$\d{2}\$/;
const PASSWORD = /password/i;

const findings: PasswordFinding[] = [];
let scanned = 0;

/**
 * Fundstellen in einem JSON-Wert: jeder Schlüssel mit „password“, jeder Text mit „password“ oder einem bcrypt-Hash.
 * Einzige Ausnahme: der Feldname in einem Validierungsfehler (`errors[].field = "password"`, US09-4).
 */
export function findPasswordLeaks(value: unknown, at = ''): string[] {
  if (typeof value === 'string') return BCRYPT_HASH.test(value) || PASSWORD.test(value) ? [at || '(Wurzel)'] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => findPasswordLeaks(item, at ? `${at}.${i}` : String(i)));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const here = at ? `${at}.${key}` : key;
    if (PASSWORD.test(key)) return [here];
    if (key === 'field' && item === 'password') return [];
    return findPasswordLeaks(item, here);
  });
}

function inspect(req: Request, res: Response, body: unknown): void {
  if (isDocsPath(req.originalUrl ?? req.url)) return;
  if (!/json/i.test(String(res.getHeader('Content-Type') ?? ''))) return;
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : null;
  if (text === null || text === '') return;
  scanned += 1;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // kein JSON trotz Header: als Text prüfen
  }
  for (const at of findPasswordLeaks(parsed)) {
    findings.push({ method: req.method, path: (req.originalUrl ?? req.url).split('?')[0], status: res.statusCode, at });
  }
}

/** Express-Middleware: prüft den Body jeder Antwort beim Senden (`res.send`, auch über `res.json`). */
export function passwordScanMiddleware(req: Request, res: Response, next: NextFunction): void {
  const send = res.send.bind(res);
  res.send = ((body?: unknown) => {
    inspect(req, res, body);
    return send(body as never);
  }) as Response['send'];
  next();
}

/** Alle Fundstellen der laufenden Testdatei (sollte leer sein). */
export function passwordFindings(): readonly PasswordFinding[] {
  return findings;
}

/** Anzahl der geprüften JSON-Antworten der laufenden Testdatei (Beleg, dass das Netz greift). */
export function scannedResponses(): number {
  return scanned;
}
