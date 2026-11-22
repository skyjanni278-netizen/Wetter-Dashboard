import type { Router, UrlTree } from '@angular/router';

/** Login-Seite (deutscher Routenname wie die übrigen Seiten, 03 B5.1). */
export const LOGIN_PATH = '/admin/anmeldung';
/** Ziel nach der Anmeldung ohne (gültiges) Rückkehrziel. */
export const ADMIN_HOME = '/admin';

const MAX_RETURN_URL_LENGTH = 2000;

/**
 * Rückkehrziel aus `?returnUrl=` nur als **interner** Pfad (kein Open Redirect):
 * - beginnt mit genau einem `/` (nicht `//host`, nicht `/\host`, kein Schema wie `https:` oder `javascript:`),
 * - kein Backslash, keine Steuerzeichen, keine Leerzeichen,
 * - nicht die Login-Seite selbst (sonst Schleife).
 * Sonst `null`; der Aufrufer nimmt dann `ADMIN_HOME`.
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > MAX_RETURN_URL_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\s\u0000-\u001F\u007F]/.test(value)) return null;
  const path = value.split(/[?#]/)[0];
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return null;
  return value;
}

/** `/admin/anmeldung?returnUrl=…`; ein ungültiges Ziel entfällt (nur interne Pfade). */
export function loginUrlTree(router: Router, returnUrl?: string | null): UrlTree {
  const target = safeReturnUrl(returnUrl);
  return router.createUrlTree([LOGIN_PATH], target ? { queryParams: { returnUrl: target } } : {});
}
