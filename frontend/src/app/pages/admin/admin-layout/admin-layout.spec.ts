import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../interceptors/auth.interceptor';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { AUTH_STORAGE_KEY } from '../../../services/auth.service';
import { AppTitleStrategy } from '../../../utils/page-title';
import { AdminLayoutComponent } from './admin-layout';

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);

function storeSession(expiresAt: number) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt,
    user: { id: 1, username: 'admin', roles: ['admin'] },
  }));
}

async function setup(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
      provideHttpClientTesting(),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  const router = TestBed.inject(Router);
  const http = TestBed.inject(HttpTestingController);
  const root = harness.fixture.nativeElement as HTMLElement;
  const nav = () => root.querySelector('nav.admin-nav') as HTMLElement | null;
  const link = (label: string) =>
    Array.from(nav()?.querySelectorAll('a') ?? []).find(a => a.textContent?.trim() === label) as HTMLAnchorElement;
  async function click(label: string) {
    link(label).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  return { harness, router, http, nav, link, click };
}

describe('Admin-Bereich: Navigation und Routen (Schritt 11)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('Unternavigation „Status“, „Importe“, „Lücken“ mit Namen; auf /admin ist nur „Status“ aktiv', async () => {
    storeSession(NOW + 3_600_000);
    const { nav, link, harness } = await setup('/admin');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(AdminLayoutComponent);
    expect(nav()?.getAttribute('aria-label')).toBe('Admin-Bereich');
    expect(Array.from(nav()!.querySelectorAll('a')).map(a => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Status', '/admin'], ['Importe', '/admin/importe'], ['Lücken', '/admin/luecken'],
    ]);
    expect(link('Status').getAttribute('aria-current')).toBe('page');
    expect(link('Importe').getAttribute('aria-current')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Status – Admin – Wetter Heubach');
  });

  it('Klick auf „Importe“ und „Lücken“: Route, aktiver Punkt und Titel wechseln; Detailseite hält „Importe“ aktiv', async () => {
    storeSession(NOW + 3_600_000);
    const { router, link, click, harness } = await setup('/admin');
    await click('Importe');
    expect(router.url).toBe('/admin/importe');
    expect(link('Importe').getAttribute('aria-current')).toBe('page');
    expect(link('Status').getAttribute('aria-current')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Importe – Admin – Wetter Heubach');

    await click('Lücken');
    expect(router.url).toBe('/admin/luecken');
    expect(TestBed.inject(Title).getTitle()).toBe('Lücken – Admin – Wetter Heubach');

    await harness.navigateByUrl('/admin/importe/12');
    harness.detectChanges();
    expect(link('Importe').getAttribute('aria-current')).toBe('page');
    expect(TestBed.inject(Title).getTitle()).toBe('Import #12 – Admin – Wetter Heubach');
    await harness.navigateByUrl('/admin/importe/abc');
    expect(TestBed.inject(Title).getTitle()).toBe('Ungültiger Import – Admin – Wetter Heubach');
  });

  it('Gast: jede Admin-Seite führt zur Anmeldung mit returnUrl (inkl. Query)', async () => {
    const { router, harness } = await setup('/admin/importe?seite=2');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte%3Fseite%3D2');
    await harness.navigateByUrl('/admin/luecken');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fluecken');
    await harness.navigateByUrl('/admin/importe/7');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte%2F7');
  });

  it('Token abgelaufen (Timer im Hintergrund verspätet), Klick auf „Importe“ → /admin/anmeldung?returnUrl=/admin/importe', async () => {
    storeSession(NOW + 3_600_000);
    const { router, click } = await setup('/admin');
    expect(router.url).toBe('/admin');
    vi.setSystemTime(NOW + 3_600_000 + 1_000); // nur die Uhr, der Ablauf-Timer ist noch nicht gelaufen
    await click('Importe');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte');
    expect(decodeURIComponent(router.url)).toBe('/admin/anmeldung?returnUrl=/admin/importe');
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('Server lehnt das Token ab (401) auf /admin/importe → Abmelden und Anmeldung mit returnUrl', async () => {
    storeSession(NOW + 3_600_000);
    const { router, http, click, harness } = await setup('/admin');
    await click('Importe');
    const list = http.expectOne(r => r.url === '/api/imports');
    expect(list.request.headers.get('Authorization')).toBe('Bearer tok');
    list.flush(
      { statusCode: 401, error: 'Unauthorized', code: 'UNAUTHENTICATED', message: 'Das Token ist ungültig oder abgelaufen.', errors: [], details: null },
      { status: 401, statusText: 'Unauthorized' },
    );
    await harness.fixture.whenStable();
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte');
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
