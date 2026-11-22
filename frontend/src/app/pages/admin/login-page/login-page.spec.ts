import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import {
  INVALID_CREDENTIALS_MESSAGE, LoginPageComponent, PASSWORD_REQUIRED_MESSAGE, TOO_MANY_ATTEMPTS_MESSAGE,
  UNREACHABLE_LOGIN_MESSAGE, USERNAME_REQUIRED_MESSAGE,
} from './login-page';
import { authInterceptor } from '../../../interceptors/auth.interceptor';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { AUTH_STORAGE_KEY, AuthService } from '../../../services/auth.service';
import type { ApiError, TokenResponse } from '../../../models/api';

@Component({ template: '' })
class Blank {}

const TOKEN: TokenResponse = {
  accessToken: 'tok-abc', tokenType: 'Bearer', expiresIn: 3600, user: { id: 1, username: 'admin', roles: ['admin'] },
};

function apiError(statusCode: number, code: string, message: string, errors: ApiError['errors'] = []): ApiError {
  return { statusCode, error: 'Error', code, message, errors, details: null };
}

function setup(returnUrl?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'admin/anmeldung', component: LoginPageComponent },
        { path: 'admin', component: Blank },
        { path: 'admin/importe', component: Blank },
        { path: '', component: Blank },
      ], withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(LoginPageComponent);
  if (returnUrl !== undefined) fixture.componentRef.setInput('returnUrl', returnUrl);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const username = el.querySelector('#login-username') as HTMLInputElement;
  const password = el.querySelector('#login-password') as HTMLInputElement;
  const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
  const form = el.querySelector('form') as HTMLFormElement;

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  function submit() {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }
  const alert = () => el.querySelector('app-notice[role="alert"]') as HTMLElement | null;
  const fieldError = (id: string) => el.querySelector(`#${id}-error`) as HTMLElement | null;

  return {
    fixture, el, username, password, button, type, submit, alert, fieldError,
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

describe('LoginPageComponent (US09, E3.7.3)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('sichtbare Labels, mit den Feldern verbunden; autocomplete username / current-password', () => {
    const { el, username, password } = setup();
    const labels = Array.from(el.querySelectorAll('label'));
    expect(labels.map(l => [l.textContent?.trim(), l.getAttribute('for')])).toEqual([
      ['Benutzername', 'login-username'],
      ['Passwort', 'login-password'],
    ]);
    expect(labels.every(l => !l.classList.contains('visually-hidden'))).toBe(true);
    expect(username.getAttribute('autocomplete')).toBe('username');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(password.type).toBe('password');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Anmelden');
  });

  it('noch nicht abgesendet: keine Fehlermeldung, kein aria-invalid', () => {
    const { username, password, alert } = setup();
    expect(username.getAttribute('aria-invalid')).toBeNull();
    expect(password.getAttribute('aria-invalid')).toBeNull();
    expect(alert()).toBeNull();
  });

  describe('Client-Prüfung (leere Felder)', () => {
    it('beide leer: Meldung an jedem Feld mit aria-invalid und aria-describedby, kein Request', () => {
      const { username, password, submit, fieldError, http } = setup();
      submit();
      expect(fieldError('login-username')?.textContent).toContain(USERNAME_REQUIRED_MESSAGE);
      expect(fieldError('login-password')?.textContent).toContain(PASSWORD_REQUIRED_MESSAGE);
      expect(username.getAttribute('aria-invalid')).toBe('true');
      expect(username.getAttribute('aria-describedby')).toBe('login-username-error');
      expect(password.getAttribute('aria-invalid')).toBe('true');
      expect(password.getAttribute('aria-describedby')).toBe('login-password-error');
      http.expectNone('/api/auth/tokens');
    });

    it('leeres Passwort (US09-9): Meldung nur am Passwort', () => {
      const { username, password, type, submit, fieldError, http } = setup();
      type(username, 'admin');
      submit();
      expect(fieldError('login-username')).toBeNull();
      expect(username.getAttribute('aria-invalid')).toBeNull();
      expect(fieldError('login-password')?.getAttribute('role')).toBe('alert');
      expect(password.getAttribute('aria-invalid')).toBe('true');
      http.expectNone('/api/auth/tokens');
    });

    it('Benutzername nur aus Leerzeichen gilt als leer', () => {
      const { username, password, type, submit, fieldError, http } = setup();
      type(username, '   ');
      type(password, 'geheim');
      submit();
      expect(fieldError('login-username')?.textContent).toContain(USERNAME_REQUIRED_MESSAGE);
      expect(username.getAttribute('aria-invalid')).toBe('true');
      http.expectNone('/api/auth/tokens');
    });

    it('Eingabe nach dem Fehler entfernt die Meldung', () => {
      const { password, type, submit, fieldError } = setup();
      submit();
      type(password, 'x');
      expect(fieldError('login-password')).toBeNull();
      expect(password.getAttribute('aria-invalid')).toBeNull();
    });
  });

  describe('Serverfehler', () => {
    function filledAndSent(ctx = setup()) {
      ctx.type(ctx.username, 'admin');
      ctx.type(ctx.password, 'falsch-falsch');
      ctx.submit();
      return { ...ctx, req: ctx.http.expectOne('/api/auth/tokens') };
    }

    it('400 mit errors[].field = "password": Meldung am Feld, kein allgemeiner Fehler', () => {
      const ctx = filledAndSent();
      ctx.req.flush(
        apiError(400, 'VALIDATION_FAILED', 'Die Anfrage enthält ungültige Werte.', [
          { field: 'password', code: 'too_big', message: 'Das Passwort darf höchstens 72 Byte lang sein.' },
        ]),
        { status: 400, statusText: 'Bad Request' },
      );
      ctx.fixture.detectChanges();
      expect(ctx.fieldError('login-password')?.textContent).toContain('Das Passwort darf höchstens 72 Byte lang sein.');
      expect(ctx.password.getAttribute('aria-invalid')).toBe('true');
      expect(ctx.password.getAttribute('aria-describedby')).toBe('login-password-error');
      expect(ctx.alert()).toBeNull();
    });

    it('400 mit Feld ohne Formularfeld (roles): Meldung oben im Formular', () => {
      const ctx = filledAndSent();
      ctx.req.flush(
        apiError(400, 'VALIDATION_FAILED', 'Die Anfrage enthält ungültige Werte.', [
          { field: 'roles', code: 'unrecognized_keys', message: 'Das Feld „roles“ ist nicht erlaubt.' },
        ]),
        { status: 400, statusText: 'Bad Request' },
      );
      ctx.fixture.detectChanges();
      expect(ctx.alert()?.textContent).toContain('Das Feld „roles“ ist nicht erlaubt.');
    });

    it('401 INVALID_CREDENTIALS: allgemeiner Fehler oben mit role="alert", Felder ohne aria-invalid, bleibt auf der Seite', () => {
      const ctx = filledAndSent();
      ctx.req.flush(apiError(401, 'INVALID_CREDENTIALS', 'Benutzername oder Passwort ist falsch.'), { status: 401, statusText: 'Unauthorized' });
      ctx.fixture.detectChanges();
      const alert = ctx.alert()!;
      expect(alert.textContent).toContain(INVALID_CREDENTIALS_MESSAGE);
      expect(alert.textContent).toContain('Fehler');
      // oben im Formular: vor dem ersten Feld
      const form = ctx.el.querySelector('form')!;
      expect(form.firstElementChild).toBe(alert);
      expect(ctx.username.getAttribute('aria-invalid')).toBeNull();
      expect(ctx.password.getAttribute('aria-invalid')).toBeNull();
      expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
      expect(ctx.button.getAttribute('aria-disabled')).toBeNull();
    });

    it('429: Hinweis auf zu viele Versuche', () => {
      const ctx = filledAndSent();
      ctx.req.flush(apiError(429, 'TOO_MANY_REQUESTS', 'Zu viele Anfragen.'), { status: 429, statusText: 'Too Many Requests' });
      ctx.fixture.detectChanges();
      expect(ctx.alert()?.textContent).toContain(TOO_MANY_ATTEMPTS_MESSAGE);
    });

    it.each([[0, 'Netzwerk'], [502, 'Proxy ohne Nest']])('Status %i (%s): Server nicht erreichbar', (status) => {
      const ctx = filledAndSent();
      if (status === 0) ctx.req.error(new ProgressEvent('error'));
      else ctx.req.flush('Bad Gateway', { status, statusText: 'Bad Gateway' });
      ctx.fixture.detectChanges();
      expect(ctx.alert()?.textContent).toContain(UNREACHABLE_LOGIN_MESSAGE);
    });

    it('erneutes Absenden entfernt den alten allgemeinen Fehler', () => {
      const ctx = filledAndSent();
      ctx.req.flush(apiError(401, 'INVALID_CREDENTIALS', 'x'), { status: 401, statusText: 'Unauthorized' });
      ctx.fixture.detectChanges();
      expect(ctx.alert()).not.toBeNull();
      ctx.submit();
      expect(ctx.alert()).toBeNull();
      ctx.http.expectOne('/api/auth/tokens').flush(TOKEN);
    });
  });

  it('während des Sendens: Button gesperrt (aria-disabled, aria-busy, Text), kein zweiter Request', () => {
    const ctx = setup();
    ctx.type(ctx.username, 'admin');
    ctx.type(ctx.password, 'geheim-geheim');
    expect(ctx.button.textContent?.trim()).toBe('Anmelden');
    ctx.submit();
    expect(ctx.button.getAttribute('aria-disabled')).toBe('true');
    expect(ctx.button.getAttribute('aria-busy')).toBe('true');
    expect(ctx.button.textContent?.trim()).toBe('Wird angemeldet …');
    ctx.submit();
    const reqs = ctx.http.match('/api/auth/tokens');
    expect(reqs.length).toBe(1);
    reqs[0].flush(apiError(401, 'INVALID_CREDENTIALS', 'x'), { status: 401, statusText: 'Unauthorized' });
    ctx.fixture.detectChanges();
    expect(ctx.button.getAttribute('aria-disabled')).toBeNull();
    expect(ctx.button.textContent?.trim()).toBe('Anmelden');
  });

  describe('Erfolg', () => {
    async function loginWith(returnUrl?: string) {
      const ctx = setup(returnUrl);
      ctx.type(ctx.username, 'admin');
      ctx.type(ctx.password, 'geheim-geheim');
      ctx.submit();
      const req = ctx.http.expectOne('/api/auth/tokens');
      expect(req.request.body).toEqual({ username: 'admin', password: 'geheim-geheim' });
      req.flush(TOKEN);
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('ohne returnUrl → /admin, Token in sessionStorage', async () => {
      const { router } = await loginWith();
      expect(router.url).toBe('/admin');
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toContain('tok-abc');
      expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
    });

    it('internes returnUrl → dorthin', async () => {
      const { router } = await loginWith('/admin/importe');
      expect(router.url).toBe('/admin/importe');
    });

    it.each(['//evil.example/admin', 'https://evil.example', '/admin/anmeldung'])('returnUrl %s wird ignoriert → /admin', async url => {
      const { router } = await loginWith(url);
      expect(router.url).toBe('/admin');
    });
  });
});
