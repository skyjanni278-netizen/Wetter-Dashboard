import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminPageComponent, ME_ERROR_MESSAGE } from './admin-page';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import type { UserResource } from '../../../models/api';

const ME: UserResource = {
  id: 1, username: 'admin', roles: ['admin'], isActive: true, createdAt: '2026-11-22T09:00:00Z', lastLoginAt: '2026-11-22T10:00:00Z',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(AdminPageComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('AdminPageComponent (Schritt 10)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lädt GET /api/auth/me und zeigt „Angemeldet als admin“', () => {
    const { fixture, el, http } = setup();
    expect(el.querySelector('app-loading')).not.toBeNull();
    http.expectOne('/api/auth/me').flush(ME);
    fixture.detectChanges();
    expect(el.querySelector('.admin-account')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Angemeldet als admin');
    expect(el.querySelector('app-loading')).toBeNull();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Verwaltung');
  });

  it('Fehler: Fehlerbox ohne Benutzer, „Erneut versuchen“ lädt neu', () => {
    const { fixture, el, http } = setup();
    http.expectOne('/api/auth/me').flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    const error = el.querySelector('app-error')!;
    expect(error.textContent).toContain(ME_ERROR_MESSAGE);
    expect(error.textContent).toContain('Server nicht erreichbar.');
    expect(el.querySelector('.admin-account')).toBeNull();

    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/auth/me').flush(ME);
    fixture.detectChanges();
    expect(el.querySelector('app-error')).toBeNull();
    expect(el.querySelector('.admin-account')?.textContent).toContain('admin');
  });
});
