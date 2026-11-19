import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { WeatherService } from './services/weather.service';

describe('App Navigation (V08)', () => {
  async function at(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        { provide: WeatherService, useValue: {
          getMonth: (year: string, month: string) => of({ year, month, data: [] }),
          getYear: (year: string) => of({ year, data: [] }),
          getToday: () => of({ date: '2026-11-19', location: 'Heubach', hourly: [] }),
          getDay: (date: string) => of({ date, location: 'Heubach', hourly: [] }),
          getForecast: () => of([]),
          getStats: () => of({ hottestDay: null, coldestDay: null, rainiestDay: null, driestStreak: null, totalDays: 0 }),
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
          getToday: () => of({ date: '2026-11-19', location: 'Heubach', hourly: [] }),
          getForecast: () => of([]),
        } },
      ],
    });
    TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/gibt-es-nicht');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
