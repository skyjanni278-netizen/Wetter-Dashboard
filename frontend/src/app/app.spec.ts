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
