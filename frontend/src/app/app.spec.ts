import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, UrlSegment, UrlSegmentGroup, provideRouter, withComponentInputBinding } from '@angular/router';
import { of, throwError } from 'rxjs';
import { App } from './app';
import { optionalParamsMatcher, routes } from './app.routes';
import { Day, Location, Records, Status } from './models/api';
import { WeatherService } from './services/weather.service';
import { AUTH_STORAGE_KEY, AuthService } from './services/auth.service';
import { MonthlyPageComponent } from './pages/monthly-page/monthly-page';
import { TodayPageComponent } from './pages/today-page/today-page';
import { YearlyPageComponent } from './pages/yearly-page/yearly-page';

const STATUS: Status = {
  locationId: 1, today: '2026-11-20', timezone: 'Europe/Berlin', dataFrom: '2025-01-01', dataTo: '2026-11-20',
  lastSuccessfulUpdateAt: null, nextScheduledUpdateAt: null, updateState: 'never',
  daysWithData: 690, daysComplete: 689, gapCount: 0,
};

const HEUBACH: Location = {
  id: 1, slug: 'heubach', name: 'Heubach', postalCode: '73540', region: 'Ostalbkreis',
  latitude: 48.7936, longitude: 9.9369, timezone: 'Europe/Berlin', isDefault: true,
};

/** Tag ohne Stunden (Seite zeigt den Leerzustand); für die Navigation reicht das. */
function emptyDay(date: string): Day {
  return {
    id: date, date, locationId: 1, timezone: 'Europe/Berlin', isToday: false,
    hoursExpected: 24, hoursObserved: 0, hoursPredicted: 0, complete: false, current: null,
    observed: { temperature: { mean: null, min: null, max: null, minAt: null, maxAt: null }, precipitationSum: null, isDryDay: null },
    predicted: { temperature: { min: null, max: null }, precipitationSum: null },
    hours: [],
  };
}

const NO_RECORDS: Records = {
  locationId: 1, hottest: null, coldest: null, wettestDay: null, longestDryPeriod: null, daysCounted: 0, excludesPredictions: true,
};

/** Antworten der neuen API für den Footer (Status und Standort). */
const footerApi = {
  getStatus: () => of(STATUS),
  getLocation: () => of(HEUBACH),
};

describe('App Navigation (V08)', () => {
  async function at(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        { provide: WeatherService, useValue: {
          ...footerApi,
          getYearList: () => of({ items: [] }),
          getMonthSummary: () => throwError(() => ({ status: 404 })),
          getDays: (from: string, to: string) => of({ items: [], meta: { from, to, count: 0 } }),
          getYearSummary: () => throwError(() => ({ status: 404 })),
          getMonthSummaries: () => throwError(() => ({ status: 404 })),
          getToday: () => of(emptyDay('2026-11-19')),
          getDay: (date: string) => of(emptyDay(date)),
          getForecasts: () => of({ items: [], fetchedAt: null }),
          getNotices: () => of({ items: [], basedOnFetchedAt: null }),
          getRecords: () => of(NO_RECORDS),
        } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.main-nav a')) as HTMLAnchorElement[];
    return (label: string) => links.find(a => a.textContent?.trim() === label)!;
  }

  it('/monat/2025/03: Nav-Link „Monat“ bleibt aktiv, keine Umleitung (F11)', async () => {
    const link = await at('/monat/2025/03');
    expect(TestBed.inject(Router).url).toBe('/monat/2025/03');
    expect(link('Monat').classList).toContain('active');
    expect(link('Monat').getAttribute('aria-current')).toBe('page');
    expect(link('Heute').getAttribute('aria-current')).toBeNull();
  });

  it('/monat ohne Parameter: Nav-Link „Monat“ aktiv', async () => {
    const link = await at('/monat');
    expect(TestBed.inject(Router).url).toBe('/monat');
    expect(link('Monat').getAttribute('aria-current')).toBe('page');
  });

  it('/jahr/2025: Nav-Link „Jahr“ bleibt aktiv', async () => {
    const link = await at('/jahr/2025');
    expect(link('Jahr').classList).toContain('active');
    expect(link('Jahr').getAttribute('aria-current')).toBe('page');
    expect(link('Monat').getAttribute('aria-current')).toBeNull();
  });

  it.each(['/', '/tag/2026-11-10'])('%s: Nav-Link „Heute“ ist aktiv (Tagesansicht)', async url => {
    const link = await at(url);
    expect(link('Heute').classList).toContain('active');
    expect(link('Heute').getAttribute('aria-current')).toBe('page');
    for (const other of ['Monat', 'Jahr', 'Rekorde']) {
      expect(link(other).getAttribute('aria-current')).toBeNull();
    }
  });

  it.each([['/monat', 'Monat'], ['/monat/2025/03', 'Monat'], ['/jahr', 'Jahr'], ['/statistiken', 'Rekorde']])(
    '%s: Nav-Link „Heute“ ist nicht aktiv', async (url, active) => {
      const link = await at(url);
      expect(link('Heute').classList).not.toContain('active');
      expect(link('Heute').getAttribute('aria-current')).toBeNull();
      expect(link(active).getAttribute('aria-current')).toBe('page');
    });

  describe('Rahmen (E3.7.1, E3.7.9)', () => {
    async function shell() {
      await at('/statistiken');
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('Skip-Link ist das erste fokussierbare Element und zielt auf <main id="main">', async () => {
      const { el } = await shell();
      const first = el.querySelector('a, button, input, select, [tabindex]') as HTMLAnchorElement;
      expect(first.classList).toContain('skip-link');
      expect(first.textContent?.trim()).toBe('Zum Inhalt springen');
      expect(first.getAttribute('href')).toBe('#main');
      const main = el.querySelector('main')!;
      expect(main.id).toBe('main');
      expect(main.getAttribute('tabindex')).toBe('-1');
    });

    it('Skip-Link fokussiert den Inhalt, ohne die Route zu wechseln', async () => {
      const { fixture, el } = await shell();
      document.body.appendChild(fixture.nativeElement);
      const link = el.querySelector('.skip-link') as HTMLAnchorElement;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(el.querySelector('main'));
      expect(TestBed.inject(Router).url).toBe('/statistiken');
      fixture.nativeElement.remove();
    });

    it('Header und Footer sind dunkle Flächen; Navigation hat einen Namen', async () => {
      const { el } = await shell();
      expect(el.querySelector('header')?.classList).toContain('surface-dark');
      expect(el.querySelector('footer')?.classList).toContain('surface-dark');
      expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Hauptnavigation');
    });

    it('Footer: statischer Text und Open-Meteo-Attribution, kein lastFetch', async () => {
      const { el } = await shell();
      const footer = el.querySelector('footer')!;
      expect(footer.textContent).toContain('Wetterdaten für Heubach');
      const links = Array.from(footer.querySelectorAll('a')).map(a => a.getAttribute('href'));
      expect(links).toContain('https://open-meteo.com');
      expect(links).toContain('https://creativecommons.org/licenses/by/4.0/');
      expect(footer.textContent).not.toContain('Zuletzt aktualisiert');
    });
  });

  it('unbekannter Pfad leitet auf / um', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        { provide: WeatherService, useValue: {
          ...footerApi,
          getToday: () => of(emptyDay('2026-11-19')),
          getForecasts: () => of({ items: [], fetchedAt: null }),
          getNotices: () => of({ items: [], basedOnFetchedAt: null }),
        } },
      ],
    });
    TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/gibt-es-nicht');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});

describe('Footer „Datenstand“ aus der neuen API (Schritt 2, US07)', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const footer = () => (fixture.nativeElement as HTMLElement).querySelector('footer')!;
    const range = () => footer().querySelector('.footer-range') as HTMLElement;
    return { fixture, footer, range };
  }

  afterEach(() => http.verify());

  it('lädt: statischer Text und Platzhalter in der Zeitraum-Zeile', () => {
    const { footer, range } = render();
    http.expectOne('/api/status');
    expect(footer().textContent).toContain('Wetterdaten für Heubach');
    expect(range().dataset['state']).toBe('loading');
    expect(range().querySelector('app-skeleton')).not.toBeNull();
  });

  it('Erfolg: Ort aus /api/locations/1 und Zeitraum dataFrom–dataTo im deutschen Format', () => {
    const { fixture, footer, range } = render();
    http.expectOne('/api/status').flush(STATUS);
    http.expectOne('/api/locations/1').flush({ ...HEUBACH, name: 'Heubach (Ostalb)' });
    fixture.detectChanges();

    expect(footer().textContent).toContain('Wetterdaten für Heubach (Ostalb)');
    expect(range().dataset['state']).toBe('success');
    expect(range().textContent?.replace(/\s+/g, ' ').trim()).toBe('Daten vom 01.01.2025 bis 20.11.2026');
    const times = Array.from(range().querySelectorAll('time')).map(t => t.getAttribute('datetime'));
    expect(times).toEqual(['2025-01-01', '2026-11-20']);
    expect(range().querySelector('app-skeleton')).toBeNull();
  });

  it('Fehler bei /api/status: statischer Text, Zeile bleibt (leer) erhalten, kein Fehlertext', () => {
    const { fixture, footer, range } = render();
    http.expectOne('/api/status').flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(footer().textContent).toContain('Wetterdaten für Heubach');
    expect(range()).not.toBeNull();
    expect(range().dataset['state']).toBe('error');
    expect(range().textContent?.trim()).toBe('');
    expect(range().querySelector('app-skeleton')).toBeNull();
  });

  it('Fehler bei /api/locations: Rückfall auf den statischen Text', () => {
    const { fixture, footer, range } = render();
    http.expectOne('/api/status').flush(STATUS);
    http.expectOne('/api/locations/1').flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(footer().textContent).toContain('Wetterdaten für Heubach');
    expect(range().dataset['state']).toBe('error');
  });

  it('Block „Datenstand“ (E3.7.9): „Zuletzt aktualisiert: …“ aus /api/status und Link „Datenstand“ auf /status (US17-4)', () => {
    const { fixture, footer } = render();
    const update = () => footer().querySelector('.footer-update') as HTMLElement;
    expect(update().querySelector('app-skeleton')).not.toBeNull();
    http.expectOne('/api/status').flush({ ...STATUS, lastSuccessfulUpdateAt: '2026-11-20T13:05:12Z', updateState: 'ok' });
    http.expectOne('/api/locations/1').flush(HEUBACH);
    fixture.detectChanges();
    expect(update().textContent?.trim()).toBe('Zuletzt aktualisiert: 20.11.2026, 14:05 Uhr');
    const link = Array.from(footer().querySelectorAll('a')).find(a => a.textContent?.trim() === 'Datenstand')!;
    expect(link.getAttribute('href')).toBe('/status');
  });

  it('Block „Datenstand“ ohne Aktualisierung (never): „Noch keine Aktualisierung“', () => {
    const { fixture, footer } = render();
    http.expectOne('/api/status').flush(STATUS);
    http.expectOne('/api/locations/1').flush(HEUBACH);
    fixture.detectChanges();
    expect(footer().querySelector('.footer-update')?.textContent?.trim()).toBe('Noch keine Aktualisierung');
  });

  it('noch keine Daten (dataFrom/dataTo null): kein Zeitraum', () => {
    const { fixture, range } = render();
    http.expectOne('/api/status').flush({ ...STATUS, dataFrom: null, dataTo: null });
    http.expectOne('/api/locations/1').flush(HEUBACH);
    fixture.detectChanges();

    expect(range().dataset['state']).toBe('error');
    expect(range().textContent?.trim()).toBe('');
  });
});

describe('Header: „Admin“ und „Abmelden“ nur nach der Anmeldung (US09, E3.7.1)', () => {
  const weather = {
    ...footerApi,
    getToday: () => of(emptyDay('2026-11-19')),
    getForecasts: () => of({ items: [], fetchedAt: null }),
    getNotices: () => of({ items: [], basedOnFetchedAt: null }),
    getRecords: () => of(NO_RECORDS),
  };

  async function render(loggedIn: boolean) {
    sessionStorage.clear();
    if (loggedIn) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt: Date.now() + 3_600_000,
        user: { id: 1, username: 'admin', roles: ['admin'] },
      }));
    }
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), { provide: WeatherService, useValue: weather }],
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/statistiken');
    await fixture.whenStable();
    fixture.detectChanges();
    const header = () => (fixture.nativeElement as HTMLElement).querySelector('header')!;
    return { fixture, router, header };
  }

  afterEach(() => sessionStorage.clear());

  it('Gast: nur die vier Punkte, kein Hinweis auf den Admin-Bereich', async () => {
    const { header } = await render(false);
    const items = Array.from(header().querySelectorAll('.main-nav a, .main-nav button')).map(e => e.textContent?.trim());
    expect(items).toEqual(['Heute', 'Monat', 'Jahr', 'Rekorde']);
    expect(header().querySelector('a[href^="/admin"]')).toBeNull();
    expect(header().textContent).not.toMatch(/Admin|Abmelden|Anmeld/);
  });

  it('angemeldet: Link „Admin“ auf /admin und Button „Abmelden“ in der Navigation', async () => {
    const { header } = await render(true);
    const nav = header().querySelector('.main-nav')!;
    const admin = Array.from(nav.querySelectorAll('a')).find(a => a.textContent?.trim() === 'Admin')!;
    expect(admin.getAttribute('href')).toBe('/admin');
    const logout = nav.querySelector('button')!;
    expect(logout.textContent?.trim()).toBe('Abmelden');
    expect(logout.getAttribute('type')).toBe('button');
  });

  it('„Abmelden“: sessionStorage leer, Links weg, Startseite', async () => {
    const { fixture, router, header } = await render(true);
    (header().querySelector('.main-nav button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(router.url).toBe('/');
    expect(header().querySelector('.main-nav button')).toBeNull();
    expect(header().textContent).not.toContain('Admin');
  });

  it('nach dem Abmelden führt /admin zur Anmeldung (US09-9)', async () => {
    const { fixture, router, header } = await render(true);
    (header().querySelector('.main-nav button') as HTMLButtonElement).click();
    await fixture.whenStable();
    await router.navigateByUrl('/admin');
    expect(router.url).toBe('/admin/anmeldung?returnUrl=%2Fadmin');
  });
});

describe('Eine Route je Seite und Fokus beim Routenwechsel (14b, WCAG 2.4.3)', () => {
  const weather = {
    ...footerApi,
    getYearList: () => of({ items: [] }),
    getMonthSummary: () => throwError(() => ({ status: 404 })),
    getDays: (from: string, to: string) => of({ items: [], meta: { from, to, count: 0 } }),
    getYearSummary: () => throwError(() => ({ status: 404 })),
    getMonthSummaries: () => throwError(() => ({ status: 404 })),
    getToday: () => of(emptyDay('2026-11-20')),
    getDay: (date: string) => of(emptyDay(date)),
    getForecasts: () => of({ items: [], fetchedAt: null }),
    getNotices: () => of({ items: [], basedOnFetchedAt: null }),
    getRecords: () => of(NO_RECORDS),
  };
  let host: HTMLElement | null = null;

  async function boot(url: string, loggedIn = false) {
    sessionStorage.clear();
    if (loggedIn) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt: Date.now() + 3_600_000,
        user: { id: 1, username: 'admin', roles: ['admin'] },
      }));
    }
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), { provide: WeatherService, useValue: weather }],
    });
    const fixture = TestBed.createComponent(App);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    const router = TestBed.inject(Router);
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const go = async (target: string) => {
      await router.navigateByUrl(target);
      await settle();
    };
    await go(url);
    const el = fixture.nativeElement as HTMLElement;
    const page = <T>(type: Type<T>) => fixture.debugElement.query(By.directive(type)).componentInstance as T;
    return { fixture, router, el, go, settle, page };
  }

  afterEach(() => {
    host?.remove();
    host = null;
    sessionStorage.clear();
  });

  it('optionalParamsMatcher: Form ohne und mit Parametern, sonst kein Treffer', () => {
    const seg = (...paths: string[]) => paths.map(p => new UrlSegment(p, {}));
    const group = new UrlSegmentGroup([], {});
    const month = optionalParamsMatcher(['monat'], 'monat', ['year', 'month']);
    expect(month(seg('monat'), group, {})?.consumed).toHaveLength(1);
    expect(month(seg('monat'), group, {})?.posParams).toBeUndefined();
    const hit = month(seg('monat', '2026', '10'), group, {})!;
    expect(hit.consumed).toHaveLength(3);
    expect(hit.posParams?.['year'].path).toBe('2026');
    expect(hit.posParams?.['month'].path).toBe('10');
    expect(month(seg('monat', '2026'), group, {})).toBeNull();
    expect(month(seg('jahr'), group, {})).toBeNull();
    const day = optionalParamsMatcher([], 'tag', ['date']);
    expect(day([], group, {})?.consumed).toEqual([]);
    expect(day(seg('tag'), group, {})).toBeNull();
    expect(day(seg('tag', '2026-11-10'), group, {})?.posParams?.['date'].path).toBe('2026-11-10');
    expect(day(seg('statistiken'), group, {})).toBeNull();
  });

  it('/ ↔ /tag/:date: dieselbe Seite bleibt erhalten, Input date folgt der URL', async () => {
    const t = await boot('/');
    const first = t.page(TodayPageComponent);
    expect(first.date()).toBeUndefined();
    await t.go('/tag/2026-11-10');
    expect(t.page(TodayPageComponent)).toBe(first);
    expect(first.date()).toBe('2026-11-10');
    await t.go('/');
    expect(t.page(TodayPageComponent)).toBe(first);
    expect(first.date()).toBeUndefined();
  });

  it('/monat → /monat/2026/10 und /jahr → /jahr/2025: Seite bleibt erhalten, Query kommt an', async () => {
    const t = await boot('/monat');
    const month = t.page(MonthlyPageComponent);
    await t.go('/monat/2026/10?vergleich=vorjahr');
    expect(t.page(MonthlyPageComponent)).toBe(month);
    expect(month.year()).toBe('2026');
    expect(month.month()).toBe('10');
    expect(month.vergleich()).toBe('vorjahr');
    await t.go('/jahr');
    const year = t.page(YearlyPageComponent);
    await t.go('/jahr/2025');
    expect(t.page(YearlyPageComponent)).toBe(year);
    expect(year.year()).toBe('2025');
  });

  it('erste Navigation: keine h1 fokussiert', async () => {
    const t = await boot('/statistiken');
    expect(document.activeElement?.tagName).not.toBe('H1');
    expect(t.el.querySelector('h1')?.hasAttribute('tabindex')).toBe(false);
  });

  it('Seitenwechsel: Fokus auf die h1 der neuen Seite (tabindex="-1")', async () => {
    const t = await boot('/statistiken');
    await t.go('/monat');
    const h1 = t.el.querySelector('main h1') as HTMLElement;
    expect(h1.textContent).toContain('November 2026');
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(h1);
  });

  it('Parameterwechsel derselben Seite: Fokus bleibt auf dem Bedienelement (Select)', async () => {
    const t = await boot('/statistiken');
    await t.go('/monat');
    const select = t.el.querySelector('#month-select') as HTMLSelectElement;
    select.focus();
    await t.go('/monat/2026/10');
    expect(t.el.querySelector('#month-select')).toBe(select);
    expect(document.activeElement).toBe(select);
  });

  it('Parameterwechsel, bei dem das Bedienelement verschwindet: Fokus auf die h1 statt auf body', async () => {
    const t = await boot('/statistiken');
    await t.go('/tag/2026-11-10');
    const button = t.el.querySelector('.page-controls button') as HTMLButtonElement;
    button.focus();
    button.remove();
    expect(document.activeElement).toBe(document.body);
    await t.go('/tag/2026-11-09');
    expect(document.activeElement).toBe(t.el.querySelector('main h1'));
  });

  it('Abmelden auf /: kein Seitenwechsel, Fokus trotzdem auf die h1 (der Button verschwindet)', async () => {
    const t = await boot('/', true);
    const logout = t.el.querySelector('.main-nav button') as HTMLButtonElement;
    logout.focus();
    logout.click();
    await t.settle();
    expect(t.el.querySelector('.main-nav button')).toBeNull();
    expect(document.activeElement).toBe(t.el.querySelector('main h1'));
  });
});
