import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { isDocsPath } from '../openapi/docs-path';

/**
 * `TRUST_PROXY` (03 B4.8, Standard `loopback`) als Wert für Express `trust proxy`: `true`/`false`, eine Zahl
 * (Anzahl Proxys) oder die Liste für `proxy-addr` (`loopback`, `uniquelocal`, IPs, CIDR, durch Komma getrennt).
 * Mit `loopback` gilt `X-Forwarded-For` nur von Caddy auf demselben Rechner; so sehen Throttler und Logs die
 * echte Client-IP, und ein Client kann sie nicht selbst vortäuschen (C1 A02).
 */
export function trustProxySetting(value: string): boolean | number | string {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false' || trimmed === '') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** `CORS_ORIGINS` (Komma-Liste, z. B. `http://localhost:4200,https://wetter.lan`); leer oder fehlt → `[]` = CORS aus. */
export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin !== '');
}

/**
 * CORS nur für die freigegebenen Origins (03 B4.8, C1 A02). Ohne Liste ruft `configureApp` `enableCors` nicht auf:
 * Dann sendet die API **kein** `Access-Control-Allow-Origin`, der Browser erlaubt nur dieselbe Origin (Frontend
 * über den Proxy). Keine Cookies (`credentials: false`), das Token kommt als `Authorization`-Header.
 */
export function corsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'If-Match'],
    exposedHeaders: ['ETag', 'Location', 'Retry-After', 'X-Request-Id'],
    credentials: false,
    maxAge: 600,
  };
}

/**
 * CSP für JSON-Antworten: nichts laden, nicht einbetten. Eine JSON-API braucht keine Quellen; die Header schützen,
 * falls ein Browser eine Antwort doch als Dokument anzeigt.
 */
const API_CSP = {
  useDefaults: false,
  directives: {
    'default-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  },
};

/**
 * CSP für die Swagger UI (`/api/docs*`, nur bei `SWAGGER_ENABLED=true`): Standard von helmet (Skripte und Styles
 * nur von derselben Origin, `img-src 'self' data:`), dazu `'unsafe-inline'` für Styles (die HTML-Seite von
 * `@nestjs/swagger` hat einen `<style>`-Block, die UI setzt `style`-Attribute) und **ohne**
 * `upgrade-insecure-requests`: Nest läuft auf `http://127.0.0.1`, der Browser würde sonst CSS/JS über https
 * anfordern und die Seite bliebe leer. Inline-Skripte bleiben verboten (die UI lädt `swagger-ui-init.js`).
 */
const DOCS_CSP = {
  useDefaults: true,
  directives: {
    'style-src': ["'self'", "'unsafe-inline'"],
    'upgrade-insecure-requests': null,
  },
};

/**
 * Sicherheitsheader mit `helmet` (03 B4.8, C1 A02): `X-Content-Type-Options: nosniff`, `X-Frame-Options`,
 * `Referrer-Policy`, `Strict-Transport-Security` (wirkt erst über https/Caddy), Cross-Origin-Header, CSP (siehe
 * oben), kein `X-Powered-By`. Erste Middleware, damit auch 404/406/413/415 und 429 die Header haben.
 */
export function securityHeadersMiddleware(docsEnabled: boolean): RequestHandler {
  const api = helmet({ contentSecurityPolicy: API_CSP });
  const docs = helmet({ contentSecurityPolicy: DOCS_CSP });
  return (req: Request, res: Response, next: NextFunction) =>
    (docsEnabled && isDocsPath(req.path) ? docs : api)(req, res, next);
}
