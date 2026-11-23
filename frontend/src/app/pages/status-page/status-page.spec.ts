import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { DATA_STATUS_ERROR_MESSAGE, DataStatusPageComponent } from './status-page';
import { routes } from '../../app.routes';
import { apiErrorInterceptor } from '../../interceptors/api-error.interceptor';
import { AUTH_STORAGE_KEY } from '../../services/auth.service';
import { AppTitleStrategy } from '../../utils/page-title';
import { apiErrorBody, statusOf } from '../../testing/admin-fixtures';
import type { Status } from '../../models/api';

const US16_OK: Partial<Status> = {
  today: '2026-11-19', dataFrom: '2025-01-01', dataTo: '2026-11-19', lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z',
  nextScheduledUpdateAt: null, updateState: 'ok', daysWithData: 688, daysComplete: 687, gapCount: 0,
};

async function setup(loggedIn = false) {
  sessionStorage.clear();
  if (loggedIn) {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt: Date.now() + 3_600_000,
      user: { id: 1, username: 'admin', roles: ['admin'] },
    }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/status', DataStatusPageComponent);
  harness.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = () => harness.routeNativeElement as HTMLElement;
  const card = (cls: string) => el().querySelector(`.${cls}`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return { harness, http, el, card };
}

describe('DataStatusPageComponent /status (N04, US17-4/-5)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('Gast: h1 „Datenstand“, vier Kennzahl-Karten, Zeitraum; keine Importtabelle, kein Admin-Link; Titel', async () => {
    const { harness, http, el, card } = await setup();
    expect(el().querySelector('app-loading')).not.toBeNull();
    http.expectOne('/api/status').flush(statusOf(US16_OK));
    harness.detectChanges();

    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Datenstand');
    const kickers = Array.from(el().querySelectorAll('app-kpi-card .kpi-kicker')).map(k => k.textContent?.trim());
    expect(kickers).toEqual(['Zuletzt aktualisiert', 'Tage mit Daten', 'Vollständige Tage', 'Lücken']);
    expect(card('status-last')).toContain('14:05');
    expect(card('status-last')).toContain('Uhr');
    expect(card('status-last')).toContain('am 19.11.2026');
    expect(card('status-last')).toContain('Aktuell');
    expect(card('status-days')).toContain('688');
    expect(card('status-days')).toContain('01.01.2025 – 19.11.2026');
    expect(card('status-complete')).toContain('687');
    expect(card('status-complete')).toContain('von 688 Tagen mit Daten');
    expect(card('status-gaps')).toContain('0');
    expect(el().querySelector('table')).toBeNull();
    expect(el().querySelector('app-update-notice')).toBeNull();
    expect(el().querySelector('a[href="/admin/importe"]')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Datenstand – Wetter Heubach');
  });

  it('Admin: zusätzlich „Importprotokoll ansehen →“ auf /admin/importe (US17-5)', async () => {
    const { harness, http, el } = await setup(true);
    http.expectOne('/api/status').flush(statusOf(US16_OK));
    harness.detectChanges();
    const link = el().querySelector('a[href="/admin/importe"]') as HTMLAnchorElement;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Importprotokoll ansehen →');
  });

  it('delayed: Hinweisbox über den Karten; never: eigener Zustand ohne Uhrzeit', async () => {
    const delayed = await setup();
    delayed.http.expectOne('/api/status').flush(statusOf({ ...US16_OK, updateState: 'delayed', lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z' }));
    delayed.harness.detectChanges();
    const notice = delayed.el().querySelector('app-update-notice app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.textContent).toContain('Stand: 19.11.2026, 11:05 Uhr');
    expect(delayed.card('status-last')).toContain('Verzögert');
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();

    const never = await setup();
    never.http.expectOne('/api/status').flush(statusOf({ ...US16_OK, updateState: 'never', lastSuccessfulUpdateAt: null }));
    never.harness.detectChanges();
    expect(never.card('status-last')).toContain('Noch keine Aktualisierung');
    expect(never.el().querySelector('app-update-notice')?.textContent).toContain('noch nie automatisch aktualisiert');
  });

  it('Fehler: eigene Meldung ohne Text des Backends, „Erneut versuchen“ lädt neu', async () => {
    const { harness, http, el } = await setup();
    http.expectOne('/api/status').flush(
      apiErrorBody(500, 'INTERNAL_ERROR', 'SQLITE_CANTOPEN: unable to open database file'), { status: 500, statusText: 'Error' },
    );
    harness.detectChanges();
    const error = el().querySelector('app-error')!;
    expect(error.textContent).toContain(DATA_STATUS_ERROR_MESSAGE);
    expect(el().textContent).not.toContain('SQLITE');
    (error.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    http.expectOne('/api/status').flush(statusOf(US16_OK));
    harness.detectChanges();
    expect(el().querySelector('app-error')).toBeNull();
    expect(el().querySelector('.status-last')).not.toBeNull();
  });

  it('die Route ist lazy und öffentlich (kein Guard)', async () => {
    const { http } = await setup();
    expect(TestBed.inject(Router).url).toBe('/status');
    http.expectOne('/api/status').flush(statusOf(US16_OK));
  });
});
