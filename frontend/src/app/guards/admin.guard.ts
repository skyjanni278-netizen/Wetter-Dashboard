import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanMatchFn, UrlSegment } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { loginUrlTree } from '../utils/return-url';

/**
 * `/admin` nur mit gültigem Token (US09, 03 B5.1). Sonst Umleitung auf
 * `/admin/anmeldung?returnUrl=<angefragter Pfad>`; `loginUrlTree` übernimmt nur interne Pfade.
 *
 * Das ist nur Komfort: Die Sicherheit liegt im Backend (`JwtAuthGuard`, 3a.15).
 * Als `CanMatchFn`, damit die Admin-Seiten (lazy) für Gäste gar nicht erst geladen werden.
 */
export const adminGuard: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  const router = inject(Router);
  // Ziel der laufenden Navigation mit Query; ohne Navigation (Test) aus den Segmenten.
  const target = router.currentNavigation()?.extractedUrl;
  const returnUrl = target ? router.serializeUrl(target) : `/${segments.map(s => s.path).join('/')}`;
  return loginUrlTree(router, returnUrl);
};
