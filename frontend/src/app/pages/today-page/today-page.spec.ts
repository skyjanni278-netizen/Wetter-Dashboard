import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { KEYBOARD_COMMIT_DELAY_MS, TodayPageComponent } from './today-page';
import { WeatherService } from '../../services/weather.service';
import { DayData, DayForecast, HourlyEntry } from '../../models/weather';
import { addDays, berlinToday, formatDateDe } from '../../utils/berlin-date';
import { describeWeather } from '../../utils/weather-icon';
import { routes } from '../../app.routes';
import { AppTitleStrategy } from '../../utils/page-title';

function hour(h: number, temperature: number | null, date = '2026-11-10'): HourlyEntry {
  return {
    time: `${date}T${String(h).padStart(2, '0')}:00`,
    temperature: temperature as number,
    apparentTemperature: 0,
    precipitation: 0,
    weathercode: 0,
    windspeed: 0,
    winddirection: 0,
  };
}

function day(date: string, temperature: number): DayData {
  return { date, location: 'Heubach', hourly: [hour(0, temperature, date), hour(12, temperature, date)] };
}

interface Mock {
  getToday: () => Observable<DayData>;
  getDay: (date: string) => Observable<DayData>;
  getForecast: () => Observable<DayForecast[]>;
}

/** Komponente ohne Router-Navigation; der Route-Parameter wird als Input gesetzt. */
function create(mock: Mock, date?: string) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: mock }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(TodayPageComponent);
  if (date !== undefined) fixture.componentRef.setInput('date', date);
  fixture.detectChanges();
  return fixture;
}

/** Simuliert den Wechsel des Route-Parameters `:date`. */
function select(fixture: ComponentFixture<TodayPageComponent>, date: string) {
  fixture.componentRef.setInput('date', date);
  fixture.detectChanges();
}

function setup(data: DayData) {
  return create({
    getToday: () => of(data),
    getDay: () => of(data),
    getForecast: () => of([]),
  }).componentInstance;
}

/** Mock, der jeden Request protokolliert („today“ oder das Datum). */
function counting(forecast: DayForecast[] = []) {
  const calls: string[] = [];
  const mock: Mock = {
    getToday: () => { calls.push('today'); return of(day(berlinToday(), 5)); },
    getDay: (date: string) => { calls.push(date); return of(day(date, 7)); },
    getForecast: () => of(forecast),
  };
  return { calls, mock };
}

/** App-Routen mit withComponentInputBinding(), Navigation wie im Browser. */
async function routed(mock: Mock, url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WeatherService, useValue: mock },
      provideRouter(routes, withComponentInputBinding()),
      provideLocationMocks(),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, TodayPageComponent);
  harness.detectChanges();
  const router = TestBed.inject(Router);
  const el = harness.fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  return {
    harness, router, el, settle,
    input: () => el.querySelector('#date-input') as HTMLInputElement,
    prev: () => el.querySelector('button[aria-label="Vorheriger Tag"]') as HTMLButtonElement,
    next: () => el.querySelector('button[aria-label="Nächster Tag"]') as HTMLButtonElement,
    todayBtn: () => Array.from(el.querySelectorAll('.controls button')).find(b => b.textContent?.trim() === 'Heute') as HTMLButtonElement,
    page: () => harness.routeDebugElement!.componentInstance as TodayPageComponent,
    title: () => TestBed.inject(Title).getTitle(),
  };
}

describe('TodayPageComponent Min/Max', () => {
  it('Tag ohne null-Werte ergibt korrektes Min/Max', () => {
    const c = setup({ date: '2026-11-10', location: 'Heubach', hourly: [hour(0, 3), hour(12, 9.5), hour(18, -1)] });
    expect(c.dayMinTemp()).toBe(-1);
    expect(c.dayMaxTemp()).toBe(9.5);
    expect(c.dayTempRange()).toBe(10.5);
  });

  it('null-Temperatur in einer Stunde wird ignoriert, Minimum ist der kleinste echte Wert (V13, F15)', () => {
    const c = setup({ date: '2026-11-10', location: 'Heubach', hourly: [hour(0, 3), hour(12, null), hour(18, 5)] });
    expect(c.dayMinTemp()).toBe(3);
    expect(c.dayMaxTemp()).toBe(5);
    expect(c.dayTempRange()).toBe(2);
  });

  it('nur null-Temperaturen ergeben null statt 0', () => {
    const c = setup({ date: '2026-11-10', location: 'Heubach', hourly: [hour(0, null), hour(12, null)] });
    expect(c.dayMinTemp()).toBeNull();
    expect(c.dayMaxTemp()).toBeNull();
    expect(c.dayTempRange()).toBeNull();
  });
});

describe('TodayPageComponent Zustandsmodell (V02)', () => {
  it('Fehler nach Erfolg setzt die Daten auf null (F03)', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? of(day('2026-11-10', 7))
        : throwError(() => ({ status: 500, error: { error: 'Serverfehler' } })),
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;

    select(fixture, '2026-11-10');
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-10');

    select(fixture, '2024-12-31');
    expect(c.state()).toBe('error');
    expect(c.dayData()).toBeNull();
    expect(c.error()).toBe('Server nicht erreichbar.');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-error')?.textContent).toContain('Server nicht erreichbar.');
    expect(el.querySelector('app-error [role="alert"]')).not.toBeNull();
    expect(el.querySelector('app-error button')?.textContent).toContain('Erneut versuchen');
    expect(el.querySelector('.hero')).toBeNull();
    expect(el.querySelector('.kpi-grid')).toBeNull();
  });

  it('404 nach Erfolg ergibt empty und Daten null', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? of(day('2026-11-10', 7))
        : throwError(() => ({ status: 404, error: { error: 'Keine Daten für 2024-12-31 gefunden.' } })),
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;

    select(fixture, '2026-11-10');
    select(fixture, '2024-12-31');
    expect(c.state()).toBe('empty');
    expect(c.dayData()).toBeNull();
    expect(c.error()).toBe('Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab dem 01.01.2025.');
  });

  it('beim Laden bleiben alte Daten sichtbar, der Inhaltsbereich trägt aria-busy', () => {
    const pending = new Subject<DayData>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10' ? of(day('2026-11-10', 7)) : pending,
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    select(fixture, '2026-11-10');
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();

    select(fixture, '2026-11-11');
    expect(c.state()).toBe('loading');
    expect(c.dayData()?.date).toBe('2026-11-10');
    // Alte Daten bleiben sichtbar, die Karten tragen aria-busy; im Seitenkopf steht der Chip „Lädt …“ (V02, V14)
    expect(el.querySelector('.hero[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.page-title app-chip')?.textContent).toContain('Lädt 11.11.2026');

    pending.next(day('2026-11-11', 8));
    fixture.detectChanges();
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-11');
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('TodayPageComponent Vorschau (V17) und Fehlertexte (V20)', () => {
  const forecast = [{ date: berlinToday(), maxTemp: 8, minTemp: 2, precipitation: 0, weathercode: 3 }];

  it('Vorschau nur bei heute, an vergangenen Tagen stattdessen der Link', async () => {
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => of(day(date, 7)),
      getForecast: () => of(forecast),
    }, '/');
    expect(t.el.querySelector('.forecast-card')).not.toBeNull();
    expect(t.el.querySelector('.forecast-link')).toBeNull();

    await t.harness.navigateByUrl('/tag/2026-11-10');
    expect(t.el.querySelector('.forecast-card')).toBeNull();
    const link = t.el.querySelector('.forecast-link button') as HTMLButtonElement;
    expect(link.textContent).toContain('Aktuelle 7-Tage-Vorschau');

    link.click();
    await t.settle();
    expect(t.router.url).toBe('/');
    expect(t.page().isToday()).toBe(true);
    expect(t.el.querySelector('.forecast-card')).not.toBeNull();
  });

  it('Netzwerkfehler (Status 0) ergibt „Server nicht erreichbar.“', () => {
    const fixture = create({
      getToday: () => throwError(() => ({ status: 0 })),
      getDay: () => throwError(() => ({ status: 0 })),
      getForecast: () => of([]),
    });
    expect(fixture.componentInstance.error()).toBe('Server nicht erreichbar.');
  });
});

describe('TodayPageComponent Race (V03, F04)', () => {
  function raceSetup() {
    const requests = new Map<string, Subject<DayData>>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => {
        const s = new Subject<DayData>();
        requests.set(date, s);
        return s;
      },
      getForecast: () => of([]),
    });
    return { fixture, c: fixture.componentInstance, requests };
  }

  it('zwei schnelle Wechsel: nur der zuletzt gewählte Tag wird übernommen', () => {
    const { fixture, c, requests } = raceSetup();

    select(fixture, '2026-11-13');
    select(fixture, '2026-11-12');

    // Antwort für den letzten Wechsel kommt zuerst, die überholte danach
    requests.get('2026-11-12')!.next(day('2026-11-12', 2));
    requests.get('2026-11-13')!.next(day('2026-11-13', 3));
    fixture.detectChanges();

    expect(c.selectedDate()).toBe('2026-11-12');
    expect(c.dayData()?.date).toBe('2026-11-12');
    expect(requests.get('2026-11-13')!.observed).toBe(false);
  });

  it('überholte Antwort vor der aktuellen wird verworfen', () => {
    const { fixture, c, requests } = raceSetup();

    select(fixture, '2026-11-13');
    select(fixture, '2026-11-12');

    requests.get('2026-11-13')!.next(day('2026-11-13', 3));
    fixture.detectChanges();
    expect(c.state()).toBe('loading');
    expect(c.dayData()?.date).toBe('2026-11-19');

    requests.get('2026-11-12')!.next(day('2026-11-12', 2));
    fixture.detectChanges();
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-12');
  });
});

describe('TodayPageComponent Route-Parameter (V08, F11, F19)', () => {
  it('gültiges Datum: 1 Request, Feld und Titel zeigen den Tag', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    expect(calls).toEqual(['2026-11-10']);
    expect(t.input().value).toBe('2026-11-10');
    expect(t.title()).toBe('10. November 2026 – Heute – Wetter Heubach');
    expect(t.el.querySelector('.hero')).not.toBeNull();
  });

  it.each(['2026-02-30', 'abc', '2026-13-01'])('ungültiges Datum „%s“: Hinweis mit Link auf heute, kein Request, keine Umleitung', async date => {
    const { calls, mock } = counting();
    const t = await routed(mock, `/tag/${date}`);
    expect(calls).toEqual([]);
    expect(t.router.url).toBe(`/tag/${date}`);
    const hint = t.el.querySelector('app-notice.notice-error') as HTMLElement;
    expect(hint.textContent).toContain('Ungültiges Datum');
    const link = hint.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/');
    expect(t.title()).toBe('Ungültiges Datum – Wetter Heubach');
    expect(t.title()).not.toContain('NaN');
    expect(t.prev().disabled).toBe(true);
    expect(t.next().disabled).toBe(true);
  });

  it('Zukunftsdatum: Vorhersage-Box mit Vorschauzeile und „Zurück zu heute“, kein Tages-Request', async () => {
    const future = addDays(berlinToday(), 3);
    const { calls, mock } = counting([{ date: future, maxTemp: 9, minTemp: 1, precipitation: 2.5, weathercode: 61 }]);
    const t = await routed(mock, `/tag/${future}`);
    expect(calls).toEqual([]);
    const box = t.el.querySelector('.future-notice') as HTMLElement;
    expect(box.textContent).toContain('Vorhersage für den');
    expect(box.textContent).toContain(formatDateDe(future));
    expect(box.textContent).toContain(describeWeather(61));
    const back = box.querySelector('a') as HTMLAnchorElement;
    expect(back.textContent).toContain('Zurück zu heute');
    expect(back.getAttribute('href')).toBe('/');
    expect(t.next().disabled).toBe(true);

    back.click();
    await t.settle();
    expect(t.router.url).toBe('/');
    expect(calls).toEqual(['today']);
  });

  it('Datum vor DATA_START: Request wie bisher und Text aus 0.3', async () => {
    const calls: string[] = [];
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => { calls.push(date); return throwError(() => ({ status: 404, error: { error: 'x' } })); },
      getForecast: () => of([]),
    }, '/tag/2024-12-31');
    expect(calls).toEqual(['2024-12-31']);
    expect(t.el.querySelector('app-empty')?.textContent)
      .toContain('Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab dem 01.01.2025.');
  });

  it('Datumsfeld hat min = DATA_START und max = heute (F19)', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/');
    expect(t.input().getAttribute('min')).toBe('2025-01-01');
    expect(t.input().getAttribute('max')).toBe(berlinToday());
  });
});

describe('TodayPageComponent Bedienung über den Router (US02-8 bis US02-11)', () => {
  it('› ist an heute deaktiviert (US02-9)', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/');
    expect(t.next().disabled).toBe(true);
    expect(t.prev().disabled).toBe(false);
  });

  it('‹ navigiert auf /tag/<Vortag>, › wieder zurück, je genau 1 Request (US02-8)', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    const page = t.page();

    t.prev().click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-09');
    expect(t.input().value).toBe('2026-11-09');
    expect(calls).toEqual(['2026-11-10', '2026-11-09']);
    expect(t.page()).toBe(page);

    t.next().click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-10');
    expect(t.input().value).toBe('2026-11-10');
    expect(calls).toEqual(['2026-11-10', '2026-11-09', '2026-11-10']);
  });

  it('Zurück-Button nach ‹ zeigt wieder den 10.11., Titel stimmt', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');

    t.prev().click();
    await t.settle();
    expect(t.title()).toBe('9. November 2026 – Heute – Wetter Heubach');

    // Im Browser richtet der App-Start den popstate-Listener ein, im Test geschieht das hier
    t.router.setUpLocationChangeListener();
    TestBed.inject(Location).back();
    // Der Router verarbeitet popstate erst im nächsten Macrotask (setTimeout)
    await new Promise(resolve => setTimeout(resolve));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-10');
    expect(t.input().value).toBe('2026-11-10');
    expect(t.title()).toBe('10. November 2026 – Heute – Wetter Heubach');
    expect(calls).toEqual(['2026-11-10', '2026-11-09', '2026-11-10']);
  });

  it('„Heute“ navigiert auf /, das Feld zeigt das heutige Datum (US02-10)', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');

    t.todayBtn().click();
    await t.settle();
    expect(t.router.url).toBe('/');
    expect(t.input().value).toBe(berlinToday());
    expect(calls).toEqual(['2026-11-10', 'today']);
  });

  it('Datumsfeld 05.11.2026: URL /tag/2026-11-05 und genau 1 Request (US02-11)', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');

    t.input().value = '2026-11-05';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(calls.filter(c => c === '2026-11-05')).toHaveLength(1);
    expect(calls).toEqual(['2026-11-10', '2026-11-05']);
  });

  it('leeres Datumsfeld: Meldung am Feld, aria-invalid, ‹ › deaktiviert, kein Request, URL unverändert (F09)', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    const before = t.title();

    t.input().value = '';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();

    expect(t.router.url).toBe('/tag/2026-11-10');
    expect(calls).toEqual(['2026-11-10']);
    expect(t.input().getAttribute('aria-invalid')).toBe('true');
    expect(t.input().getAttribute('aria-describedby')).toContain('date-input-error');
    expect(t.el.querySelector('#date-input-error')?.textContent).toContain('Bitte ein Datum wählen.');
    expect(t.prev().disabled).toBe(true);
    expect(t.next().disabled).toBe(true);
    expect(t.title()).toBe(before);
    expect(t.title()).not.toContain('NaN');

    // Ein gewähltes Datum hebt die Meldung wieder auf
    t.input().value = '2026-11-05';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(t.input().getAttribute('aria-invalid')).toBeNull();
    expect(t.el.querySelector('#date-input-error')).toBeNull();
  });

  it('leeres Datumsfeld auf /: „Heute“ setzt das Feld zurück und lädt neu', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/');

    t.input().value = '';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();
    expect(calls).toEqual(['today']);
    expect(t.input().getAttribute('aria-invalid')).toBe('true');

    t.todayBtn().click();
    await t.settle();
    expect(t.router.url).toBe('/');
    expect(t.input().value).toBe(berlinToday());
    expect(t.input().getAttribute('aria-invalid')).toBeNull();
    expect(calls).toEqual(['today', 'today']);
  });
});

describe('TodayPageComponent Datumsfeld: Tastatureingabe und Grenzen (F09, F19)', () => {
  function type(t: Awaited<ReturnType<typeof routed>>, value: string) {
    t.input().value = value;
    t.input().dispatchEvent(new Event('change'));
  }

  it('Tippen von „05112026“: Zwischenwerte navigieren nicht, nur der fertige Tag ergibt 1 Request', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    const range = `Bitte ein Datum zwischen 01.01.2025 und ${formatDateDe(berlinToday())} wählen.`;

    // Chromium meldet beim Tippen der Jahresziffern jeden vollständigen Zwischenwert als change
    for (const partial of ['0002-11-05', '0020-11-05', '0202-11-05']) {
      type(t, partial);
      await t.settle();
      expect(t.router.url).toBe('/tag/2026-11-10');
      expect(t.input().value).toBe(partial);
      expect(t.input().getAttribute('aria-invalid')).toBe('true');
      expect(t.el.querySelector('#date-input-error')?.textContent).toContain(range);
      expect(t.prev().disabled).toBe(true);
      expect(t.next().disabled).toBe(true);
    }
    expect(calls).toEqual(['2026-11-10']);

    type(t, '2026-11-05');
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(calls).toEqual(['2026-11-10', '2026-11-05']);
    expect(t.input().getAttribute('aria-invalid')).toBeNull();
    expect(t.el.querySelector('#date-input-error')).toBeNull();
  });

  it('getipptes Datum nach heute oder vor DATA_START: Meldung, keine Navigation, kein Request', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');

    for (const value of [addDays(berlinToday(), 1), '2024-12-31']) {
      type(t, value);
      await t.settle();
      expect(t.router.url).toBe('/tag/2026-11-10');
      expect(t.input().getAttribute('aria-invalid')).toBe('true');
      expect(t.input().getAttribute('aria-describedby')).toContain('date-input-error');
    }
    expect(calls).toEqual(['2026-11-10']);
  });

  it('Meldung am Feld wird vorgelesen (role="alert")', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/');
    type(t, '');
    await t.settle();
    expect(t.el.querySelector('#date-input-error')?.getAttribute('role')).toBe('alert');
  });

  it('‹ ist an DATA_START (01.01.2025) deaktiviert, am Folgetag nicht', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2025-01-01');
    expect(t.prev().disabled).toBe(true);
    t.prev().click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2025-01-01');

    await t.harness.navigateByUrl('/tag/2025-01-02');
    expect(t.prev().disabled).toBe(false);
    expect(calls).toEqual(['2025-01-01', '2025-01-02']);
  });
});

describe('TodayPageComponent Datumsfeld: getippte Eingabe wird gesammelt übernommen', () => {
  /** Eine Ziffer tippen: keydown, danach meldet Chromium den neuen vollständigen Wert als change. */
  function typeKey(t: Awaited<ReturnType<typeof routed>>, value: string) {
    t.input().dispatchEvent(new KeyboardEvent('keydown', { key: '5' }));
    t.input().value = value;
    t.input().dispatchEvent(new Event('change'));
  }
  // Zwischenwerte beim Tippen von „05112026“ auf dem 10.11.2026 (Tag, Monat, Jahr)
  const steps = ['2026-11-05', '2026-01-05', '2026-11-05', '0002-11-05', '0020-11-05', '0202-11-05', '2026-11-05'];

  it('nach einer Pause genau 1 Navigation und 1 Request', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');

    for (const value of steps) {
      typeKey(t, value);
      await t.settle();
      expect(t.router.url).toBe('/tag/2026-11-10');
    }
    expect(calls).toEqual(['2026-11-10']);
    expect(t.input().getAttribute('aria-invalid')).toBeNull();

    await new Promise(resolve => setTimeout(resolve, KEYBOARD_COMMIT_DELAY_MS + 100));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(calls).toEqual(['2026-11-10', '2026-11-05']);
  });

  it('Enter übernimmt sofort', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    for (const value of steps) typeKey(t, value);
    t.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(calls).toEqual(['2026-11-10', '2026-11-05']);
  });

  it('Verlassen des Felds übernimmt sofort, ‹ geht danach vom getippten Tag aus', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    for (const value of steps) typeKey(t, value);
    t.input().dispatchEvent(new Event('blur'));
    t.prev().click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-04');
    expect(calls.at(-1)).toBe('2026-11-04');
    expect(calls.filter(c => c === '2026-11-10')).toHaveLength(1);
  });

  it('ungültiger Zwischenstand beim Verlassen: keine Navigation, Meldung bleibt', async () => {
    const { calls, mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    typeKey(t, '0202-11-05');
    t.input().dispatchEvent(new Event('blur'));
    await new Promise(resolve => setTimeout(resolve, KEYBOARD_COMMIT_DELAY_MS + 100));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-10');
    expect(calls).toEqual(['2026-11-10']);
    expect(t.input().getAttribute('aria-invalid')).toBe('true');
  });
});

describe('TodayPageComponent Aufbau nach E3.9 (F17, F23, F24, V16)', () => {
  const forecast: DayForecast[] = [
    { date: berlinToday(), maxTemp: 8.4, minTemp: 2.2, precipitation: 0, weathercode: 3 },
    { date: addDays(berlinToday(), 1), maxTemp: 9, minTemp: 1, precipitation: 2.5, weathercode: 61 },
  ];

  it('vergangener Tag: großer Wert trägt den Kicker „Höchstwert“, jeder Wert steht nur einmal, Datum ausgeschrieben', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    const hero = t.el.querySelector('.hero') as HTMLElement;
    expect(hero.querySelector('.kicker')?.textContent?.trim()).toBe('Höchstwert');
    expect(hero.querySelector('.hero-value')?.textContent).toContain('7');
    expect(t.el.querySelector('h1')?.textContent?.trim()).toBe('Dienstag, 10. November 2026');
    expect(t.el.querySelector('.page-title .kicker')?.textContent?.trim()).toBe('Rückblick');
    // ISO-Datum und doppelte Datumskarte entfallen (F24)
    expect(t.el.textContent).not.toContain('2026-11-10');
    const kickers = Array.from(t.el.querySelectorAll('app-kpi-card .kpi-kicker')).map(k => k.textContent?.trim());
    expect(kickers).toEqual(['Niederschlag gesamt', 'Temperaturschwankung']);
  });

  it('heute: Hero mit Kicker „Jetzt · … Uhr“, Kennzahlen als Karten mit einheitlicher Kante', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/');
    expect(t.el.querySelector('.hero .kicker')?.textContent).toMatch(/^\s*Jetzt · \d{2}:\d{2} Uhr\s*$/);
    expect(t.el.querySelectorAll('app-kpi-card')).toHaveLength(4);
    expect(t.el.querySelector('.page-title .kicker')?.textContent?.trim()).toBe('Heute');
  });

  it('7-Tage-Vorschau ist eine Tabelle mit Wettertext (Wochentag, Symbol mit Text, Max, Min, Niederschlag)', async () => {
    const { mock } = counting(forecast);
    const t = await routed(mock, '/');
    const table = t.el.querySelector('.forecast-card table') as HTMLTableElement;
    expect(table.querySelector('caption')?.textContent).toContain('7-Tage-Vorschau');
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.replace(/\u00AD/g, '').trim());
    expect(heads).toEqual(['Tag', 'Wetter', 'Max', 'Min', 'Niederschlag']);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    const first = Array.from(rows[0].children).map(c => c.textContent?.trim());
    expect(first[0]).toBe('Heute');
    expect(first[1]).toContain(describeWeather(3));
    expect(first[2]).toContain('8');
    expect(first[3]).toContain('2');
    expect(first[4]).toMatch(/0[.,]0/);
    expect(rows[1].children[1].textContent).toContain(describeWeather(61));
    expect(rows[1].children[4].textContent).toMatch(/2[.,]5/);
  });
});
