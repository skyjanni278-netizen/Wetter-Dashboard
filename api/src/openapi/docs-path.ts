/** Swagger UI unter `/api/docs`, JSON unter `/api/docs-json` (03 B3.7, B3.1). */
export const SWAGGER_PATH = 'api/docs';

/** `/api/docs`, `/api/docs/…` (UI und ihre Dateien), `/api/docs-json`, `/api/docs-yaml`. */
const DOCS_PATH_PATTERN = /^\/api\/docs(?:$|[/-])/;

/**
 * Pfade der Doku sind von der 406-Prüfung ausgenommen, weil die Swagger UI HTML ist (B3.1). Eigene
 * Datei ohne `@nestjs/swagger`, damit die `ContentNegotiationMiddleware` das Paket nicht lädt.
 */
export function isDocsPath(path: string): boolean {
  return DOCS_PATH_PATTERN.test(path);
}
