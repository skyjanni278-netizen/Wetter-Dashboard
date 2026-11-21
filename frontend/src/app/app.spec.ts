import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { of, throwError } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { Day, Location, Records, Status } from './models/api';
import { WeatherService } from './services/weather.service';

const STATUS: Status = {
  locationId: 1, today: '2026-11-20', timezone: 'Europe/Berlin', dataFrom: '2025-01-01', dataTo: '2026-11-20',
  lastSuccessfulUpdateAt: null, updateState: 'never',
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

  it('noch keine Daten (dataFrom/dataTo null): kein Zeitraum', () => {
    const { fixture, range } = render();
    http.expectOne('/api/status').flush({ ...STATUS, dataFrom: null, dataTo: null });
    http.expectOne('/api/locations/1').flush(HEUBACH);
    fixture.detectChanges();

    expect(range().dataset['state']).toBe('error');
    expect(range().textContent?.trim()).toBe('');
  });
});
