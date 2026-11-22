import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AUTH_STORAGE_KEY, AuthService } from './auth.service';
import type { AuthSession } from './auth.service';
import type { TokenResponse } from '../models/api';

@Component({ template: '' })
class Blank {}

const NOW = new Date('2026-11-22T10:00:00Z').getTime();

const TOKEN: TokenResponse = {
  accessToken: 'eyJ.test.token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: { id: 1, username: 'admin', roles: ['admin'] },
};

function storedSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return { ...TOKEN, expiresAt: NOW + 3_600_000, ...overrides };
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: Blank },
        { path: 'statistiken', component: Blank },
        { path: 'admin/anmeldung', component: Blank },
        { path: 'admin', children: [{ path: '', component: Blank }, { path: 'importe', component: Blank }] },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

/** Simuliert F5: neue App-Instanz, `sessionStorage` bleibt. */
function reload() {
  TestBed.resetTestingModule();
  return setup();
}

function stored(): unknown {
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('AuthService (US09)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  describe('login()', () => {
    it('POST /api/auth/tokens mit username und password; Token, expiresIn und user in Signal und sessionStorage', async () => {
      const { auth, http } = setup();
      expect(auth.isLoggedIn()).toBe(false);

      const result = firstValueFrom(auth.login('admin', 'geheim-geheim'));
      const req = http.expectOne('/api/auth/tokens');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'admin', password: 'geheim-geheim' });
      req.flush(TOKEN);

      await expect(result).resolves.toEqual(TOKEN.user);
      expect(auth.isLoggedIn()).toBe(true);
      expect(auth.user()).toEqual(TOKEN.user);
      expect(auth.accessToken()).toBe('eyJ.test.token');
      expect(stored()).toEqual({ ...TOKEN, expiresAt: NOW + 3_600_000 });
      http.verify();
    });

    it('401: Fehler geht an den Aufrufer, nichts gespeichert', async () => {
      const { auth, http } = setup();
      const result = firstValueFrom(auth.login('admin', 'falsch'));
      http.expectOne('/api/auth/tokens').flush(
        { statusCode: 401, error: 'Unauthorized', code: 'INVALID_CREDENTIALS', message: 'Benutzername oder Passwort ist falsch.', errors: [], details: null },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(result).rejects.toMatchObject({ status: 401 });
      expect(auth.isLoggedIn()).toBe(false);
      expect(stored()).toBeNull();
    });

    it('Antwort ohne Token: Fehler, nicht angemeldet', async () => {
      const { auth, http } = setup();
      const result = firstValueFrom(auth.login('admin', 'x'));
      http.expectOne('/api/auth/tokens').flush({ user: TOKEN.user });
      await expect(result).rejects.toThrow();
      expect(auth.isLoggedIn()).toBe(false);
      expect(stored()).toBeNull();
    });

    it('sessionStorage gesperrt: kein Absturz, Anmeldung gilt im Speicher', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      const { auth, http } = setup();
      const result = firstValueFrom(auth.login('admin', 'geheim-geheim'));
      http.expectOne('/api/auth/tokens').flush(TOKEN);
      await expect(result).resolves.toEqual(TOKEN.user);
      expect(auth.isLoggedIn()).toBe(true);
    });
  });

  describe('Wiederherstellen beim Start (F5)', () => {
    it('gültiger Eintrag: angemeldet mit Benutzer und Token', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession()));
      const { auth } = setup();
      expect(auth.isLoggedIn()).toBe(true);
      expect(auth.user()?.username).toBe('admin');
      expect(auth.accessToken()).toBe(TOKEN.accessToken);
    });

    it('Login, dann F5: Anmeldung bleibt', async () => {
      const first = setup();
      const result = firstValueFrom(first.auth.login('admin', 'geheim-geheim'));
      first.http.expectOne('/api/auth/tokens').flush(TOKEN);
      await result;

      const { auth } = reload();
      expect(auth.isLoggedIn()).toBe(true);
      expect(auth.accessToken()).toBe(TOKEN.accessToken);
    });

    it('abgelaufener Eintrag wird verworfen und aus sessionStorage gelöscht', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession({ expiresAt: NOW - 1 })));
      const { auth } = setup();
      expect(auth.isLoggedIn()).toBe(false);
      expect(stored()).toBeNull();
    });

    it.each([
      ['kein JSON', '{kaputt'],
      ['ohne Token', JSON.stringify({ ...storedSession(), accessToken: '' })],
      ['ohne expiresAt', JSON.stringify({ ...TOKEN })],
      ['falscher tokenType', JSON.stringify({ ...storedSession(), tokenType: 'Basic' })],
      ['user ohne roles', JSON.stringify({ ...storedSession(), user: { id: 1, username: 'admin' } })],
    ])('kaputter Eintrag (%s) wird verworfen', (_name, raw) => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, raw);
      const { auth } = setup();
      expect(auth.isLoggedIn()).toBe(false);
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('sessionStorage wirft beim Lesen: nicht angemeldet, kein Absturz', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      const { auth } = setup();
      expect(auth.isLoggedIn()).toBe(false);
    });
  });

  describe('Ablauf-Timer', () => {
    async function loggedIn(expiresIn = 3600) {
      const ctx = setup();
      const result = firstValueFrom(ctx.auth.login('admin', 'geheim-geheim'));
      ctx.http.expectOne('/api/auth/tokens').flush({ ...TOKEN, expiresIn });
      await result;
      return ctx;
    }

    it('bis kurz vor Ablauf angemeldet, danach abgemeldet und sessionStorage leer', async () => {
      const { auth } = await loggedIn();
      vi.advanceTimersByTime(3_600_000 - 1);
      expect(auth.isLoggedIn()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(auth.isLoggedIn()).toBe(false);
      expect(stored()).toBeNull();
    });

    it('nach F5 läuft der Timer mit der Restzeit weiter', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession({ expiresAt: NOW + 60_000 })));
      const { auth } = setup();
      vi.advanceTimersByTime(59_999);
      expect(auth.isLoggedIn()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(auth.isLoggedIn()).toBe(false);
    });

    it('abgelaufen, aber Timer noch nicht gelaufen (Hintergrund-Tab): accessToken() ist null und meldet ab', async () => {
      const { auth } = await loggedIn();
      vi.setSystemTime(NOW + 3_600_000 + 5_000);
      expect(auth.accessToken()).toBeNull();
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.isLoggedIn()).toBe(false);
    });

    it('Ablauf auf einer Admin-Seite: weiter zur Anmeldung mit returnUrl', async () => {
      const { router } = await loggedIn();
      await router.navigateByUrl('/admin/importe?seite=2');
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte%3Fseite%3D2');
    });

    it('Ablauf auf einer Gastseite: abmelden, aber keine Umleitung', async () => {
      const { auth, router } = await loggedIn();
      await router.navigateByUrl('/statistiken');
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(auth.isLoggedIn()).toBe(false);
      expect(router.url).toBe('/statistiken');
    });
  });

  describe('logout()', () => {
    it('leert Signal und sessionStorage (US09-9); der Timer läuft nicht mehr', async () => {
      const { auth, http, router } = setup();
      const result = firstValueFrom(auth.login('admin', 'geheim-geheim'));
      http.expectOne('/api/auth/tokens').flush(TOKEN);
      await result;
      await router.navigateByUrl('/admin');
      expect(stored()).not.toBeNull();

      auth.logout();
      expect(auth.isLoggedIn()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(auth.accessToken()).toBeNull();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(vi.getTimerCount()).toBe(0);

      const { auth: afterReload } = reload();
      expect(afterReload.isLoggedIn()).toBe(false);
    });

    it('ohne Anmeldung: nichts passiert', () => {
      const { auth } = setup();
      expect(() => auth.logout()).not.toThrow();
      expect(auth.isLoggedIn()).toBe(false);
    });
  });

  it('me(): GET /api/auth/me', async () => {
    const { auth, http } = setup();
    const result = firstValueFrom(auth.me());
    const req = http.expectOne('/api/auth/me');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 1, username: 'admin', roles: ['admin'], isActive: true, createdAt: '2026-11-22T09:00:00Z', lastLoginAt: null });
    await expect(result).resolves.toMatchObject({ username: 'admin' });
  });
});
