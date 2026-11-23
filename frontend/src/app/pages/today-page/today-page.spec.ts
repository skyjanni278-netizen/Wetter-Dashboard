import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { Location, registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { provideLocationMocks } from '@angular/common/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { KEYBOARD_COMMIT_DELAY_MS, TodayPageComponent } from './today-page';
import { WeatherService } from '../../services/weather.service';
import { ApiError, Day, DayHour, Forecast, ForecastList, Notice, NoticeList, Status } from '../../models/api';
import { DataStatusService } from '../../services/data-status.service';
import { AUTH_STORAGE_KEY } from '../../services/auth.service';
import { statusOf } from '../../testing/admin-fixtures';
import { ClimateChartComponent } from '../../components/climate-chart/climate-chart';
import { addDays, berlinToday, formatDateDe, formatDateLongDe } from '../../utils/berlin-date';
import { describeWeather } from '../../utils/weather-icon';
import { routes } from '../../app.routes';
import { AppTitleStrategy, dayViewTitle } from '../../utils/page-title';

// Wie in app.config.ts: Zahlen deutsch („9,6 °C“)
registerLocaleData(localeDe);
const GERMAN = { provide: LOCALE_ID, useValue: 'de-DE' };

const pad = (n: number) => String(n).padStart(2, '0');

function hour(h: number, temperature: number | null, date = '2026-11-10', extra: Partial<DayHour> = {}): DayHour {
  return {
    id: 1000 + h,
    timeLocal: `${date}T${pad(h)}:00`,
    temperature,
    apparentTemperature: 0,
    precipitation: 0,
    weatherCode: 0,
    windSpeed: 0,
    windDirection: 0,
    source: null,
    isPrediction: false,
    correctedAt: null,
    ...extra,
  };
}

/** Tag nach `GET /api/days/:date` mit zwei vergangenen Stunden; heute mit `current` = 12:00. */
function day(date: string, temperature: number, overrides: Partial<Day> = {}): Day {
  const isToday = date === berlinToday();
  return {
    id: date, date, locationId: 1, timezone: 'Europe/Berlin', isToday,
    hoursExpected: 24, hoursObserved: 2, hoursPredicted: 0, complete: false,
    current: isToday ? { observationId: null, timeLocal: `${date}T12:00` } : null,
    observed: {
      temperature: { mean: temperature, min: temperature, max: temperature, minAt: `${date}T00:00`, maxAt: `${date}T00:00` },
      precipitationSum: 0, isDryDay: null,
    },
    predicted: { temperature: { min: null, max: null }, precipitationSum: null },
    hours: [hour(0, temperature, date), hour(12, temperature, date)],
    ...overrides,
  };
}

/**
 * Heute wie Fixture `us16-ok` bei „jetzt“ 14:30 (FAKE_NOW 13:30Z): 00–14 Uhr vergangen, ab 15 Uhr
 * Vorhersage (darunter 35 °C um 20 Uhr, die in keine Kennzahl zählen darf).
 */
function liveToday(): Day {
  const date = berlinToday();
  const hours = Array.from({ length: 24 }, (_, h) => hour(h, 8.5, date, {
    isPrediction: h >= 15,
    source: h >= 15 ? 'prediction' : 'forecast_api',
    precipitation: h >= 15 ? 0.6 : 0,
  }));
  hours[14] = hour(14, 9.6, date, {
    apparentTemperature: 5.1, precipitation: 0.4, weatherCode: 61, windSpeed: 21.3, windDirection: 232, source: 'forecast_api',
  });
  hours[20] = hour(20, 35, date, { isPrediction: true, source: 'prediction' });
  return {
    ...day(date, 9),
    isToday: true, hoursObserved: 15, hoursPredicted: 9,
    current: { observationId: null, timeLocal: `${date}T14:00` },
    observed: {
      temperature: { mean: 9, min: 8.4, max: 9.8, minAt: `${date}T06:00`, maxAt: `${date}T13:00` },
      precipitationSum: 0.4, isDryDay: null,
    },
    predicted: { temperature: { min: 8.1, max: 9.4 }, precipitationSum: 5.4 },
    hours,
  };
}

function forecastDay(date: string, maxTemp: number, minTemp: number, precipitationSum: number, weatherCode: number): Forecast {
  return { locationId: 1, date, maxTemp, minTemp, precipitationSum, weatherCode, fetchedAt: '2026-11-19T13:05:00Z' };
}

function list(items: Forecast[] = []): ForecastList {
  return { items, fetchedAt: items.length ? '2026-11-19T13:05:00Z' : null };
}

/** Fehlerantwort nach B3.3, wie sie der Interceptor durchreicht. */
function apiFailure(status: number, body: Partial<ApiError>): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Error',
    error: { statusCode: status, error: 'Error', message: 'Fehler', errors: [], details: null, code: 'X', ...body },
  });
}

const NO_DATA = (date: string) => apiFailure(404, {
  code: 'NO_DATA', message: `Für den ${formatDateDe(date)} liegen keine Daten vor. Daten gibt es ab 01.01.2025.`,
  details: { dataFrom: '2025-01-01' },
});

const FUTURE_MESSAGE = 'Das Datum liegt in der Zukunft. Erlaubt ist höchstens heute (19.11.2026).';
const DATE_IN_FUTURE = () => apiFailure(400, {
  code: 'DATE_IN_FUTURE', message: FUTURE_MESSAGE, errors: [{ field: 'date', code: 'too_big', message: FUTURE_MESSAGE }],
});

interface Mock {
  getToday: () => Observable<Day>;
  getDay: (date: string) => Observable<Day>;
  getForecasts: () => Observable<ForecastList>;
  /** Hinweise (N07, seit 12c); ohne Angabe eine leere Liste. */
  getNotices?: () => Observable<NoticeList>;
}

const NO_NOTICES: NoticeList = { items: [], basedOnFetchedAt: null };

/** Mock mit leerer Hinweisliste, falls der Test keine eigenen Hinweise vorgibt. */
function withNotices(mock: Mock): Required<Mock> {
  return { getNotices: () => of(NO_NOTICES), ...mock } as Required<Mock>;
}

/** Komponente ohne Router-Navigation; der Route-Parameter wird als Input gesetzt. */
function create(mock: Mock, date?: string) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: withNotices(mock) }, provideRouter([]), GERMAN],
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

function setup(data: Day) {
  return create({
    getToday: () => of(data),
    getDay: () => of(data),
    getForecasts: () => of(list()),
  }, data.isToday ? undefined : data.date);
}

/** Mock, der jeden Request protokolliert („today“ oder das Datum). */
function counting(forecast: Forecast[] = [], today: () => Day = () => day(berlinToday(), 5)) {
  const calls: string[] = [];
  const mock: Mock = {
    getToday: () => { calls.push('today'); return of(today()); },
    getDay: (date: string) => { calls.push(date); return of(day(date, 7)); },
    getForecasts: () => of(list(forecast)),
  };
  return { calls, mock };
}

function harnessHelpers(harness: RouterTestingHarness) {
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
    kpis: () => Array.from(el.querySelectorAll('app-kpi-card')) as HTMLElement[],
  };
}

/** App-Routen mit withComponentInputBinding(), Navigation wie im Browser. */
async function routed(mock: Mock, url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WeatherService, useValue: withNotices(mock) },
      provideRouter(routes, withComponentInputBinding()),
      provideLocationMocks(),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
      GERMAN,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, TodayPageComponent);
  harness.detectChanges();
  return harnessHelpers(harness);
}

describe('TodayPageComponent Kennzahlen aus observed (F13, F15, S8)', () => {
  it('vergangener Tag: Höchst-, Tiefstwert und Summe kommen aus observed, nicht aus den Stunden', () => {
    const data = day('2026-11-10', 5, {
      observed: {
        temperature: { mean: 4, min: -1, max: 9.5, minAt: '2026-11-10T06:00', maxAt: '2026-11-10T14:00' },
        precipitationSum: 3.2, isDryDay: false,
      },
    });
    const c = setup(data).componentInstance;
    expect(c.observedMin()).toBe(-1);
    expect(c.observedMax()).toBe(9.5);
    expect(c.observedPrecip()).toBe(3.2);
    expect(c.dayTempRange()).toBe(10.5);
  });

  it('observed ohne Temperatur (alle null): Min/Max null statt 0, Kennzahl zeigt „–“', () => {
    const data = day('2026-11-10', 5, {
      observed: {
        temperature: { mean: null, min: null, max: null, minAt: null, maxAt: null },
        precipitationSum: null, isDryDay: null,
      },
      hours: [hour(0, null), hour(12, null)],
    });
    const fixture = setup(data);
    const c = fixture.componentInstance;
    expect(c.observedMin()).toBeNull();
    expect(c.observedMax()).toBeNull();
    expect(c.dayTempRange()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.hero-value')?.textContent?.trim()).toBe('–');
    expect(el.querySelector('app-kpi-card .kpi-value')?.textContent?.trim()).toBe('–');
  });
});

describe('TodayPageComponent heute mit current und predicted (US01-3, US01-6, F13)', () => {
  it('Hero „Jetzt · 14:00 Uhr“ mit Temperatur, „Gefühlt …“ und Wind der Stunde current.timeLocal', async () => {
    const { mock } = counting([], liveToday);
    const t = await routed(mock, '/');
    const hero = t.el.querySelector('.hero') as HTMLElement;
    expect(hero.querySelector('.kicker')?.textContent?.trim()).toBe('Jetzt · 14:00 Uhr');
    expect(hero.querySelector('.hero-value')?.textContent).toMatch(/9,6\s°C/);
    expect(hero.querySelector('.hero-sub')?.textContent).toMatch(/Gefühlt 5,1\s°C/);
    expect(hero.querySelector('.hero-desc')?.textContent).toContain(describeWeather(61));
    const facts = hero.querySelector('dl.hero-facts') as HTMLElement;
    expect(facts.textContent).toContain('Wind');
    expect(facts.textContent).toMatch(/21\skm\/h aus SW/);
    // Rest des Tages aus predicted (Vorhersage)
    expect(facts.textContent).toMatch(/Rest des Tages.*8,1\s°C bis 9,4\s°C/s);
  });

  it('Kennzahlen „bis jetzt“ aus observed; Niederschlag mit „+5,4 mm erwartet“ und Chip „Vorhersage“', async () => {
    const { mock } = counting([], liveToday);
    const t = await routed(mock, '/');
    const kpis = t.kpis();
    expect(kpis.map(k => k.querySelector('.kpi-kicker')?.textContent?.trim()))
      .toEqual(['Höchstwert bis jetzt', 'Tiefstwert bis jetzt', 'Niederschlag bis jetzt']);
    // 35 °C um 20 Uhr ist Vorhersage und zählt nicht (F13)
    expect(kpis[0].querySelector('.kpi-value')?.textContent).toContain('9,8');
    expect(kpis[0].querySelector('.kpi-meta')?.textContent).toContain('um 13:00 Uhr');
    expect(kpis[1].querySelector('.kpi-value')?.textContent).toContain('8,4');
    expect(kpis[1].querySelector('.kpi-meta')?.textContent).toContain('um 06:00 Uhr');
    expect(t.el.querySelector('.kpi-grid')?.textContent).not.toContain('35');
    expect(t.el.querySelector('.hero')?.textContent).not.toContain('35');
    const precip = kpis[2];
    expect(precip.querySelector('.kpi-value')?.textContent).toContain('0,4');
    expect(precip.querySelector('.kpi-meta')?.textContent).toMatch(/\+5,4\smm erwartet/);
    const chip = precip.querySelector('app-chip.chip-forecast') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('Vorhersage');
  });

  it('Vorhersageband im Diagramm ab der ersten Stunde mit isPrediction (15:00)', async () => {
    const { mock } = counting([], liveToday);
    const t = await routed(mock, '/');
    expect(t.page().chartPredictionFrom()).toBe(15);
    const chart = t.harness.fixture.debugElement.query(By.directive(ClimateChartComponent)).componentInstance as ClimateChartComponent;
    expect(chart.predictionFromIndex()).toBe(15);
  });

  it('Band folgt isPrediction, nicht der Uhrzeit: ohne Vorhersagestunde kein Band', () => {
    const data = { ...liveToday(), hoursPredicted: 0, predicted: { temperature: { min: null, max: null }, precipitationSum: null } };
    data.hours = data.hours.map(h => ({ ...h, isPrediction: false }));
    const fixture = setup(data);
    expect(fixture.componentInstance.chartPredictionFrom()).toBeNull();
    // Ohne Vorhersagestunden kein „erwartet“ und kein Vorhersage-Chip an der Kennzahl
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('erwartet');
    expect(el.querySelector('app-kpi-card app-chip')).toBeNull();
  });

  it('heute ohne current (noch keine vergangene Stunde): kein Hero, Kennzahlen bleiben', async () => {
    const { mock } = counting([], () => ({ ...liveToday(), current: null }));
    const t = await routed(mock, '/');
    expect(t.el.querySelector('.hero')).toBeNull();
    expect(t.kpis()).toHaveLength(3);
  });

  it('vergangener Tag: kein „bis jetzt“, kein Vorhersage-Chip, kein Band', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/tag/2026-11-10');
    expect(t.el.textContent).not.toContain('bis jetzt');
    expect(t.el.textContent).not.toContain('erwartet');
    expect(t.el.querySelector('app-kpi-card app-chip')).toBeNull();
    expect(t.page().chartPredictionFrom()).toBeNull();
  });
});

describe('TodayPageComponent Zustandsmodell (V02)', () => {
  it('Fehler nach Erfolg setzt die Daten auf null (F03)', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? of(day('2026-11-10', 7))
        : throwError(() => apiFailure(500, { code: 'INTERNAL_ERROR', message: 'Interner Fehler' })),
      getForecasts: () => of(list()),
    });
    const c = fixture.componentInstance;

    select(fixture, '2026-11-10');
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-10');

    select(fixture, '2025-06-01');
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

  it('404 NO_DATA nach Erfolg: Fehlerbox, Daten null', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10' ? of(day('2026-11-10', 7)) : throwError(() => NO_DATA(date)),
      getForecasts: () => of(list()),
    });
    const c = fixture.componentInstance;

    select(fixture, '2026-11-10');
    select(fixture, '2024-12-31');
    expect(c.state()).toBe('error');
    expect(c.dayData()).toBeNull();
    expect(c.apiError()?.code).toBe('NO_DATA');
    expect(c.error()).toBe('Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab dem 01.01.2025.');
  });

  it('beim Laden bleiben alte Daten sichtbar, der Inhaltsbereich trägt aria-busy', () => {
    const pending = new Subject<Day>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10' ? of(day('2026-11-10', 7)) : pending,
      getForecasts: () => of(list()),
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
  const forecast = [forecastDay(berlinToday(), 8, 2, 0, 3)];

  it('Vorschau nur bei heute, an vergangenen Tagen stattdessen der Link', async () => {
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => of(day(date, 7)),
      getForecasts: () => of(list(forecast)),
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

  it('Netzwerkfehler (Status 0) ergibt „Server nicht erreichbar.“ mit „Erneut versuchen“', () => {
    const offline = () => throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' }));
    const fixture = create({ getToday: offline, getDay: offline, getForecasts: () => of(list()) });
    expect(fixture.componentInstance.error()).toBe('Server nicht erreichbar.');
    expect(fixture.componentInstance.retryable()).toBe(true);
  });

  it('„Erneut versuchen“ lädt denselben Tag noch einmal', () => {
    const calls: string[] = [];
    let fail = true;
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => {
        calls.push(date);
        return fail ? throwError(() => new HttpErrorResponse({ status: 503 })) : of(day(date, 7));
      },
      getForecasts: () => of(list()),
    }, '2026-11-10');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-error')).not.toBeNull();
    fail = false;
    (el.querySelector('app-error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(calls).toEqual(['2026-11-10', '2026-11-10']);
    expect(el.querySelector('app-error')).toBeNull();
    expect(el.querySelector('.hero')).not.toBeNull();
  });
});

describe('TodayPageComponent Fehler der neuen API (B3.3, B5.2)', () => {
  it('/tag/2024-12-31 (NO_DATA): Fehlerbox mit Hinweis auf den Datenbeginn und genau einem Link zum 01.01.2025', async () => {
    const calls: string[] = [];
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => { calls.push(date); return throwError(() => NO_DATA(date)); },
      getForecasts: () => of(list()),
    }, '/tag/2024-12-31');
    expect(calls).toEqual(['2024-12-31']);
    const box = t.el.querySelector('app-error') as HTMLElement;
    expect(box.textContent).toContain('Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab dem 01.01.2025.');
    const links = Array.from(box.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Zum Datenbeginn (01.01.2025)');
    expect(links[0].getAttribute('href')).toBe('/tag/2025-01-01');
    // Erneut versuchen ändert an fehlenden Daten nichts
    expect(box.querySelector('button')).toBeNull();
    expect(t.el.querySelector('app-empty')).toBeNull();

    links[0].click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2025-01-01');
    expect(calls).toEqual(['2024-12-31', '2025-01-01']);
  });

  it('400 DATE_IN_FUTURE: Meldung am Datumsfeld (aria-invalid), Fehlerbox ohne Retry, ‹ bleibt bedienbar', async () => {
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => date === '2026-11-10' ? throwError(() => DATE_IN_FUTURE()) : of(day(date, 7)),
      getForecasts: () => of(list()),
    }, '/tag/2026-11-10');
    expect(t.page().state()).toBe('error');
    expect(t.el.querySelector('#date-input-error')?.textContent).toContain(FUTURE_MESSAGE);
    expect(t.input().getAttribute('aria-invalid')).toBe('true');
    expect(t.input().getAttribute('aria-describedby')).toContain('date-input-error');
    expect(t.el.querySelector('app-error')?.textContent).toContain(FUTURE_MESSAGE);
    expect(t.el.querySelector('app-error button')).toBeNull();
    expect(t.prev().disabled).toBe(false);

    // Nächster Request (‹) entfernt den Server-Fehler am Feld
    t.prev().click();
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-09');
    expect(t.el.querySelector('#date-input-error')).toBeNull();
    expect(t.input().getAttribute('aria-invalid')).toBeNull();
  });

  it('400 VALIDATION_FAILED mit field "date": Meldung am Feld; eine Eingabe im Feld entfernt sie', async () => {
    const message = 'Ungültiges Datum.';
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? throwError(() => apiFailure(400, {
            code: 'VALIDATION_FAILED', message: 'Die Eingabe ist ungültig.',
            errors: [{ field: 'date', code: 'invalid_date', message }],
          }))
        : of(day(date, 7)),
      getForecasts: () => of(list()),
    }, '/tag/2026-11-10');
    expect(t.el.querySelector('#date-input-error')?.textContent).toContain(message);
    expect(t.el.querySelector('app-error')?.textContent).toContain('Die Eingabe ist ungültig.');

    t.input().value = '2026-11-05';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    expect(t.el.querySelector('#date-input-error')).toBeNull();
  });

  it('400 ohne field "date": keine Meldung am Feld, nur die Fehlerbox', async () => {
    const t = await routed({
      getToday: () => of(day(berlinToday(), 5)),
      getDay: () => throwError(() => apiFailure(400, {
        code: 'VALIDATION_FAILED', message: 'Die Eingabe ist ungültig.', errors: [{ field: 'x', code: 'unrecognized_keys', message: 'x' }],
      })),
      getForecasts: () => of(list()),
    }, '/tag/2026-11-10');
    expect(t.el.querySelector('#date-input-error')).toBeNull();
    expect(t.el.querySelector('app-error')?.textContent).toContain('Die Eingabe ist ungültig.');
  });
});

describe('TodayPageComponent gegen die neue API (HttpTestingController)', () => {
  async function routedHttp(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        GERMAN,
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url, TodayPageComponent);
    return { http, harness, navigation };
  }

  it('/tag/2026-11-10, Datumsfeld 05.11.: je genau 1 Request auf /api/days/<Datum>, Vorschau aus /api/forecasts', async () => {
    const { http, harness, navigation } = await routedHttp('/tag/2026-11-10');
    await navigation;
    harness.detectChanges();
    http.expectOne('/api/forecasts').flush(list());
    http.expectOne('/api/notices').flush(NO_NOTICES);
    http.expectOne('/api/days/2026-11-10').flush(day('2026-11-10', 7));
    harness.detectChanges();
    const t = harnessHelpers(harness);
    expect(t.el.querySelector('.hero .kicker')?.textContent?.trim()).toBe('Höchstwert');

    t.input().value = '2026-11-05';
    t.input().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/tag/2026-11-05');
    http.expectOne('/api/days/2026-11-05').flush(day('2026-11-05', 4));
    await t.settle();
    expect(t.input().value).toBe('2026-11-05');
    // Gleiche Route: die Vorschau wird nicht erneut geladen
    http.verify();
  });

  it('/: Request auf /api/days/today; ‹ danach auf /api/days/<gestern>', async () => {
    const { http, harness, navigation } = await routedHttp('/');
    await navigation;
    harness.detectChanges();
    http.expectOne('/api/forecasts').flush(list());
    http.expectOne('/api/notices').flush(NO_NOTICES);
    http.expectOne('/api/days/today').flush(liveToday());
    harness.detectChanges();
    const t = harnessHelpers(harness);
    expect(t.el.querySelector('.hero .kicker')?.textContent?.trim()).toBe('Jetzt · 14:00 Uhr');

    t.prev().click();
    await t.settle();
    const yesterday = addDays(berlinToday(), -1);
    http.expectOne(`/api/days/${yesterday}`).flush(day(yesterday, 3));
    // Wechsel / → /tag/… baut die Seite neu auf und lädt die Vorschau erneut (offen seit Schritt 0.4)
    http.match('/api/forecasts').forEach(req => req.flush(list()));
    http.match('/api/notices').forEach(req => req.flush(NO_NOTICES));
    await t.settle();
    expect(t.router.url).toBe(`/tag/${yesterday}`);
    http.verify();
  });
});

describe('TodayPageComponent Race (V03, F04)', () => {
  function raceSetup() {
    const requests = new Map<string, Subject<Day>>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => {
        const s = new Subject<Day>();
        requests.set(date, s);
        return s;
      },
      getForecasts: () => of(list()),
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
    const { calls, mock } = counting([forecastDay(future, 9, 1, 2.5, 61)]);
    const t = await routed(mock, `/tag/${future}`);
    expect(calls).toEqual([]);
    const box = t.el.querySelector('.future-notice') as HTMLElement;
    expect(box.textContent).toContain('Vorhersage für den');
    expect(box.textContent).toContain(formatDateDe(future));
    expect(box.textContent).toContain(describeWeather(61));
    expect(box.textContent).toMatch(/2,5\smm/);
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
      getDay: (date: string) => { calls.push(date); return throwError(() => NO_DATA(date)); },
      getForecasts: () => of(list()),
    }, '/tag/2024-12-31');
    expect(calls).toEqual(['2024-12-31']);
    expect(t.el.querySelector('app-error')?.textContent)
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
  const forecast: Forecast[] = [
    forecastDay(berlinToday(), 8.4, 2.2, 0, 3),
    forecastDay(addDays(berlinToday(), 1), 9, 1, 2.5, 61),
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

  it('heute: Hero mit Kicker „Jetzt · … Uhr“, drei Kennzahlen „bis jetzt“ (Wind steht im Hero)', async () => {
    const { mock } = counting();
    const t = await routed(mock, '/');
    expect(t.el.querySelector('.hero .kicker')?.textContent).toMatch(/^\s*Jetzt · \d{2}:\d{2} Uhr\s*$/);
    expect(t.el.querySelectorAll('app-kpi-card')).toHaveLength(3);
    expect(t.el.querySelector('.hero dl.hero-facts')?.textContent).toContain('Wind');
    expect(t.el.querySelector('.page-title .kicker')?.textContent?.trim()).toBe('Heute');
  });

  it('7-Tage-Vorschau ist eine Tabelle mit Wettertext (Wochentag, Symbol mit Text, Max, Min, Niederschlag)', async () => {
    const { mock } = counting(forecast);
    const t = await routed(mock, '/');
    const table = t.el.querySelector('.forecast-card table') as HTMLTableElement;
    expect(table.querySelector('caption')?.textContent).toContain('7-Tage-Vorschau');
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.replace(/­/g, '').trim());
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

describe('TodayPageComponent: Heute und Datenstand laut Server (N01, 03 B4.8, Schritt 12a)', () => {
  /** Server-Heute wie mit FAKE_NOW: absichtlich ein anderer Tag als die Browser-Uhr. */
  const SERVER_TODAY = addDays(berlinToday(), -4);

  async function routedWithStatus(base: Mock, url: string, options: { loggedIn?: boolean } = {}) {
    sessionStorage.clear();
    if (options.loggedIn) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600, expiresAt: Date.now() + 3_600_000,
        user: { id: 1, username: 'admin', roles: ['admin'] },
      }));
    }
    // getStatus als Subject, damit der Zeitpunkt der Antwort steuerbar ist
    const status = new Subject<Status>();
    TestBed.configureTestingModule({
      providers: [
        { provide: WeatherService, useValue: { ...withNotices(base), getStatus: () => status.asObservable() } },
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
        GERMAN,
      ],
    });
    TestBed.inject(DataStatusService).load(); // wie App beim Start
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, TodayPageComponent);
    harness.detectChanges();
    const respond = async (overrides: Partial<Status> = {}) => {
      status.next(statusOf({ today: SERVER_TODAY, ...overrides }));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    return { ...harnessHelpers(harness), respond };
  }

  const liveServerDay = () => day(SERVER_TODAY, 5, { isToday: true, current: { observationId: 1, timeLocal: `${SERVER_TODAY}T12:00` } });

  afterEach(() => sessionStorage.clear());

  it('„/“: Überschrift, max und › folgen status.today statt der Browser-Uhr; nur ein Request /days/today', async () => {
    const { calls, mock } = counting([], liveServerDay);
    const t = await routedWithStatus(mock, '/');
    await t.respond();
    expect(t.page().selectedDate()).toBe(SERVER_TODAY);
    expect(t.el.querySelector('h1')?.textContent?.trim()).toBe(formatDateLongDe(SERVER_TODAY));
    expect(t.input().getAttribute('max')).toBe(SERVER_TODAY);
    expect(t.next().disabled).toBe(true);
    expect(calls).toEqual(['today']);
    expect(t.title()).toBe(`${dayViewTitle(SERVER_TODAY)} – Wetter Heubach`);
  });

  it('mit Datum: kein Request, bis /api/status geantwortet hat; der Browser-Tag ist dann Zukunft (kein Request, kein 400)', async () => {
    const { calls, mock } = counting();
    const t = await routedWithStatus(mock, `/tag/${berlinToday()}`);
    expect(calls).toEqual([]);
    await t.respond();
    expect(calls).toEqual([]);
    expect(t.page().isFuture()).toBe(true);
    expect(t.el.querySelector('.future-notice')).not.toBeNull();
  });

  it('mit Datum vor heute: genau ein Request nach der Antwort von /api/status', async () => {
    const { calls, mock } = counting();
    const date = addDays(SERVER_TODAY, -2);
    const t = await routedWithStatus(mock, `/tag/${date}`);
    expect(calls).toEqual([]);
    await t.respond();
    expect(calls).toEqual([date]);
  });

  it('US16-4: „Stand: 14:05 Uhr“ im Seitenkopf, keine Hinweisbox bei ok', async () => {
    const t = await routedWithStatus(counting([], liveServerDay).mock, '/');
    await t.respond({ updateState: 'ok', lastSuccessfulUpdateAt: `${SERVER_TODAY}T13:05:12Z`, nextScheduledUpdateAt: null });
    expect(t.el.querySelector('.page-title .page-stand')?.textContent?.trim()).toBe('Stand: 14:05 Uhr');
    expect(t.el.querySelector('app-update-notice')).toBeNull();
  });

  it('US16-5: delayed → Hinweisbox (Hinweisstil) als erstes über dem Inhalt; never → eigener Zustand', async () => {
    const t = await routedWithStatus(counting([], liveServerDay).mock, '/');
    await t.respond({ updateState: 'delayed', lastSuccessfulUpdateAt: `${SERVER_TODAY}T10:05:12Z` });
    const first = t.el.querySelector('.page-stack')!.firstElementChild as HTMLElement;
    expect(first.tagName.toLowerCase()).toBe('app-update-notice');
    expect(first.querySelector('app-notice')?.classList).toContain('notice-info');
    expect(first.textContent).toContain(`Stand: ${formatDateDe(SERVER_TODAY)}, 11:05 Uhr`);
    expect(first.textContent).toContain('keine Aktualisierung');
    expect(t.el.querySelector('.page-stand')?.textContent?.trim()).toBe('Stand: 11:05 Uhr');

    TestBed.inject(DataStatusService).refresh();
    await t.respond({ updateState: 'never', lastSuccessfulUpdateAt: null });
    expect(t.el.querySelector('.page-stand')?.textContent?.trim()).toBe('Stand: noch keine Aktualisierung');
    expect(t.el.querySelector('app-update-notice')?.textContent).toContain('noch nie automatisch aktualisiert');
  });

  it('US16-6: vergangener Tag ohne „Stand“, ohne Hinweisbox, ohne Vorhersage-Chip; Kicker „Rückblick“', async () => {
    const date = addDays(SERVER_TODAY, -9);
    const t = await routedWithStatus(counting().mock, `/tag/${date}`);
    await t.respond({ updateState: 'delayed', lastSuccessfulUpdateAt: `${SERVER_TODAY}T10:05:12Z` });
    expect(t.el.querySelector('.page-stand')).toBeNull();
    expect(t.el.querySelector('app-update-notice')).toBeNull();
    expect(t.el.querySelector('app-chip.chip-forecast')).toBeNull();
    expect(t.el.querySelector('.page-title .kicker')?.textContent?.trim()).toBe('Rückblick');
  });

  it('Admin: Link „Werte korrigieren“ auf /admin/korrektur/:date; Gäste sehen ihn nicht', async () => {
    const date = addDays(SERVER_TODAY, -1);
    const admin = await routedWithStatus(counting().mock, `/tag/${date}`, { loggedIn: true });
    await admin.respond();
    expect(admin.el.querySelector('.page-admin-link a')?.getAttribute('href')).toBe(`/admin/korrektur/${date}`);
    TestBed.resetTestingModule();

    const guest = await routedWithStatus(counting().mock, `/tag/${date}`);
    await guest.respond();
    expect(guest.el.querySelector('.page-admin-link')).toBeNull();
  });
});

describe('TodayPageComponent: Chip „KORRIGIERT“ (US13-12)', () => {
  it('„Werte als Tabelle“: Spalte „Korrektur“ mit Chip an der korrigierten Stunde', () => {
    const data = day('2026-11-10', 5, {
      hours: [hour(0, 5), hour(14, 9.6, '2026-11-10', { correctedAt: '2026-11-19T13:20:00Z' })],
    });
    const el = setup(data).nativeElement as HTMLElement;
    const table = el.querySelector('.chart-details table') as HTMLTableElement;
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.trim());
    expect(heads).toContain('Korrektur');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows[1].querySelector('app-chip')?.textContent?.trim()).toBe('Korrigiert');
    expect(rows[0].querySelector('app-chip')).toBeNull();
  });

  it('ohne korrigierte Stunde: keine Spalte „Korrektur“', () => {
    const el = setup(day('2026-11-10', 5)).nativeElement as HTMLElement;
    const heads = Array.from(el.querySelectorAll('.chart-details thead th')).map(th => th.textContent?.trim());
    expect(heads).not.toContain('Korrektur');
  });
});

describe('TodayPageComponent: Hinweise aus der Vorhersage (N07, US20-6, Schritt 12c)', () => {
  const FROST: Notice = {
    id: '2026-11-21-frost', type: 'frost', date: '2026-11-21', value: -2.3, threshold: 0, comparator: 'lt', unit: '°C',
  };
  const forecast = [forecastDay(berlinToday(), 8, 2, 0, 3)];
  const mockWith = (getNotices: () => Observable<NoticeList>): Mock => ({
    getToday: () => of(liveToday()),
    getDay: (date: string) => of(day(date, 7)),
    getForecasts: () => of(list(forecast)),
    getNotices,
  });
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  it('mit Hinweis: Box im Hinweisstil (nicht Fehlerrot) direkt über der 7-Tage-Vorschau, mit festem Text', async () => {
    const t = await routed(mockWith(() => of({ items: [FROST], basedOnFetchedAt: '2026-11-19T13:05:12Z' })), '/');
    const column = t.el.querySelector('.forecast-column')!;
    expect(Array.from(column.children).map(c => c.tagName.toLowerCase())).toEqual(['app-forecast-notices', 'app-card']);
    expect(column.children[1].classList).toContain('forecast-card');
    const notice = column.querySelector('app-forecast-notices app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.classList).not.toContain('notice-error');
    expect(text(notice.querySelector('.notice-kicker'))).toBe('Hinweis');
    expect(text(notice)).toContain('Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C');
    expect(text(notice)).toContain('Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst');
  });

  it('ohne Hinweise: keine Box, die Vorschau steht wie bisher', async () => {
    const t = await routed(mockWith(() => of({ items: [], basedOnFetchedAt: '2026-11-19T13:05:12Z' })), '/');
    expect(t.el.querySelector('app-forecast-notices')).toBeNull();
    expect(t.el.querySelector('.forecast-card')).not.toBeNull();
    expect(t.el.textContent).not.toContain('Kein amtlicher Warnhinweis');
  });

  it('Fehler beim Laden der Hinweise: keine Box, kein Fehlerzustand, Vorschau nutzbar', async () => {
    const t = await routed(mockWith(() => throwError(() => apiFailure(500, { code: 'INTERNAL_ERROR' }))), '/');
    expect(t.el.querySelector('app-forecast-notices')).toBeNull();
    expect(t.el.querySelector('app-error')).toBeNull();
    expect(t.page().state()).toBe('success');
    expect(t.el.querySelectorAll('.forecast-card tbody tr')).toHaveLength(1);
  });

  it('vergangener Tag (/tag/2026-11-10): keine Box, auch wenn es Hinweise gibt', async () => {
    const t = await routed(mockWith(() => of({ items: [FROST], basedOnFetchedAt: '2026-11-19T13:05:12Z' })), '/tag/2026-11-10');
    expect(t.el.querySelector('app-forecast-notices')).toBeNull();
    expect(t.el.textContent).not.toContain('Frost möglich');
  });
});
