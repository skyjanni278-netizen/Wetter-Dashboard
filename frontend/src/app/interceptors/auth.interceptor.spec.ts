import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { ApiErrorResponse, apiErrorInterceptor } from './api-error.interceptor';
import { AUTH_STORAGE_KEY, AuthService } from '../services/auth.service';

@Component({ template: '' })
class Blank {}

const UNAUTHENTICATED = {
  statusCode: 401, error: 'Unauthorized', code: 'UNAUTHENTICATED',
  message: 'Das Token ist ungültig oder abgelaufen. Bitte neu anmelden.', errors: [], details: null,
};

function setup(loggedIn: boolean) {
  sessionStorage.clear();
  if (loggedIn) {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'tok-123', tokenType: 'Bearer', expiresIn: 3600, expiresAt: Date.now() + 3_600_000,
      user: { id: 1, username: 'admin', roles: ['admin'] },
    }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: Blank },
        { path: 'admin/anmeldung', component: Blank },
        { path: 'admin', component: Blank },
      ]),
      provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    client: TestBed.inject(HttpClient),
    http: TestBed.inject(HttpTestingController),
    auth: TestBed.inject(AuthService),
    router: TestBed.inject(Router),
  };
}

describe('authInterceptor (US09, B5.1)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  describe('Bearer nur für relative /api/-URLs', () => {
    it.each(['/api/auth/me', '/api/imports', '/api/days/today', '/api/gaps?from=2026-01-01'])('angemeldet: %s bekommt Authorization: Bearer', url => {
      const { client, http } = setup(true);
      client.get(url).subscribe();
      const req = http.expectOne(url);
      expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
      req.flush({});
    });

    it.each([
      '/api/auth/tokens',
      '/api/auth/tokens?x=1',
      'https://evil.example/api/auth/me',
      'http://localhost:3000/api/auth/me',
      '//evil.example/api/auth/me',
      'api/auth/me',
      '/apix/auth/me',
      '/assets/fonts/inter.woff2',
    ])('angemeldet: %s bekommt kein Token', url => {
      const { client, http } = setup(true);
      client.get(url).subscribe();
      const req = http.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('nicht angemeldet: kein Header', () => {
      const { client, http } = setup(false);
      client.get('/api/auth/me').subscribe({ error: () => undefined });
      const req = http.expectOne('/api/auth/me');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('Login-POST geht ohne Token raus, auch wenn schon angemeldet', () => {
      const { client, http } = setup(true);
      client.post('/api/auth/tokens', { username: 'admin', password: 'x' }).subscribe();
      const req = http.expectOne('/api/auth/tokens');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });
  });

  describe('401', () => {
    it('geschützte Anfrage: abmelden, weiter zur Anmeldung mit returnUrl; Fehler kommt als ApiErrorResponse an', async () => {
      const { client, http, auth, router } = setup(true);
      await router.navigateByUrl('/admin');
      const result = firstValueFrom(client.get('/api/auth/me'));
      http.expectOne('/api/auth/me').flush(UNAUTHENTICATED, { status: 401, statusText: 'Unauthorized' });

      const error = await result.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiErrorResponse);
      expect((error as ApiErrorResponse).apiError.code).toBe('UNAUTHENTICATED');
      expect(auth.isLoggedIn()).toBe(false);
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      await new Promise(resolve => setTimeout(resolve));
      expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin');
    });

    it('401 vom Login (INVALID_CREDENTIALS): keine Abmeldung, keine Umleitung', async () => {
      const { client, http, auth, router } = setup(true);
      await router.navigateByUrl('/admin/anmeldung');
      const result = firstValueFrom(client.post('/api/auth/tokens', {}));
      http.expectOne('/api/auth/tokens').flush(
        { ...UNAUTHENTICATED, code: 'INVALID_CREDENTIALS', message: 'Benutzername oder Passwort ist falsch.' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(result).rejects.toMatchObject({ status: 401 });
      expect(auth.isLoggedIn()).toBe(true);
      expect(router.url).toBe('/admin/anmeldung');
    });

    it('auf der Login-Seite: keine Umleitung auf sich selbst', async () => {
      const { client, http, router } = setup(true);
      await router.navigateByUrl('/admin/anmeldung?returnUrl=%2Fadmin');
      const result = firstValueFrom(client.get('/api/auth/me'));
      http.expectOne('/api/auth/me').flush(UNAUTHENTICATED, { status: 401, statusText: 'Unauthorized' });
      await expect(result).rejects.toMatchObject({ status: 401 });
      await new Promise(resolve => setTimeout(resolve));
      expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin');
    });

    it.each([403, 500, 0])('Status %i: bleibt angemeldet', async status => {
      const { client, http, auth, router } = setup(true);
      await router.navigateByUrl('/admin');
      const result = firstValueFrom(client.get('/api/imports'));
      const req = http.expectOne('/api/imports');
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush(null, { status, statusText: 'x' });
      await expect(result).rejects.toBeInstanceOf(ApiErrorResponse);
      expect(auth.isLoggedIn()).toBe(true);
      expect(router.url).toBe('/admin');
    });
  });
});
