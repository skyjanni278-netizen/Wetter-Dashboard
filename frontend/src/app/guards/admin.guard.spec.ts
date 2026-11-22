import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import type { Route } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AUTH_STORAGE_KEY, AuthService } from '../services/auth.service';

@Component({ template: 'admin' })
class AdminStub {}

@Component({ template: 'login' })
class LoginStub {}

function session(expiresAt: number) {
  return JSON.stringify({
    accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt,
    user: { id: 1, username: 'admin', roles: ['admin'] },
  });
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([
        { path: 'admin/anmeldung', component: LoginStub },
        {
          path: 'admin',
          canMatch: [adminGuard],
          children: [{ path: '', component: AdminStub }, { path: 'importe', component: AdminStub }],
        },
        { path: '**', redirectTo: '' },
        { path: '', component: LoginStub },
      ]),
    ],
  });
  return TestBed.inject(Router);
}

describe('adminGuard (US09)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('Gast: /admin → /admin/anmeldung?returnUrl=%2Fadmin', async () => {
    const router = setup();
    await router.navigateByUrl('/admin');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin');
  });

  it('Gast: Unterseite mit Query bleibt als Rückkehrziel erhalten', async () => {
    const router = setup();
    await router.navigateByUrl('/admin/importe?seite=2');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte%3Fseite%3D2');
  });

  it('angemeldet: /admin bleibt', async () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, session(Date.now() + 3_600_000));
    const router = setup();
    await router.navigateByUrl('/admin');
    expect(router.url).toBe('/admin');
  });

  it('abgelaufenes Token: Umleitung zur Anmeldung', async () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, session(Date.now() + 3_600_000));
    const router = setup();
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
    vi.useFakeTimers({ now: Date.now() + 3_600_001, toFake: ['Date'] });
    try {
      await router.navigateByUrl('/admin');
      expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ohne laufende Navigation: Rückkehrziel aus den Segmenten, nur interner Pfad', () => {
    const router = setup();
    const segments = [new UrlSegment('admin', {}), new UrlSegment('luecken', {})];
    const result = TestBed.runInInjectionContext(() => adminGuard({} as Route, segments));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fluecken');
  });

  it('Login-Seite selbst ist für Gäste erreichbar (kein Guard davor)', async () => {
    const router = setup();
    await router.navigateByUrl('/admin/anmeldung');
    expect(router.url).toBe('/admin/anmeldung');
  });
});
