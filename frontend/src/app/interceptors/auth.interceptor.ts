import { HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService, LOGIN_ENDPOINT } from '../services/auth.service';
import { LOGIN_PATH, loginUrlTree } from '../utils/return-url';

/** Pfad ohne Query und Fragment. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * Geschützte Anfrage im Sinne des Interceptors: **relative** URL unter `/api/` (gleiche Origin,
 * Dev-Proxy bzw. später Caddy), aber nicht der Login selbst. Absolute URLs (`https://…`),
 * protokollrelative (`//host/api/…`) und andere Pfade bekommen nie ein Token.
 */
export function isProtectedApiRequest(req: HttpRequest<unknown>): boolean {
  const path = pathOf(req.url);
  return path.startsWith('/api/') && path !== LOGIN_ENDPOINT;
}

/**
 * Bearer-Token und 401 (US09, 03 B5.1, B5.2 „Nicht angemeldet“).
 *
 * - Hängt `Authorization: Bearer <token>` nur an geschützte Anfragen (`isProtectedApiRequest`) und
 *   nur, wenn ein gültiges Token da ist. Gast-Endpunkte ignorieren den Header (`@Public()`).
 * - 401 auf eine geschützte Anfrage: Token verwerfen (`logout()`) und zur Anmeldung mit dem aktuellen
 *   Pfad als `returnUrl`. Der Fehler geht trotzdem weiter an den Aufrufer.
 *   Eine 401 vom Login (`INVALID_CREDENTIALS`) zeigt die Login-Seite selbst an, ohne Umleitung.
 *
 * Reihenfolge (`app.config.ts`): `withInterceptors([authInterceptor, apiErrorInterceptor])`, wie in
 * 03 B5.1. Anfragen laufen in Listenreihenfolge, Antworten umgekehrt; `authInterceptor` ist also der
 * **äußere**: Er setzt den Header vor allen anderen und sieht Fehler erst, nachdem der
 * `apiErrorInterceptor` sie in eine `ApiErrorResponse` übersetzt hat. Er gibt diese unverändert
 * weiter, sodass die Seiten auch bei 401 `apiError` bekommen.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isProtectedApiRequest(req)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.logout();
        const current = router.url;
        if (pathOf(current) !== LOGIN_PATH) void router.navigateByUrl(loginUrlTree(router, current));
      }
      return throwError(() => error);
    }),
  );
};
