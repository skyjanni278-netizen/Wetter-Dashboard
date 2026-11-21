import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { YEAR_EMPTY_MESSAGE, YEAR_ERROR_MESSAGE, YearlyPageComponent } from './yearly-page';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary, MonthSummaryList, YearList, YearSummary } from '../../models/api';
import { berlinToday } from '../../utils/berlin-date';
import { routes } from '../../app.routes';
import { AppTitleStrategy } from '../../utils/page-title';

const temperature = (mean: number | null) => ({ mean, min: null, max: null, minAt: null, maxAt: null });

/** Jahreszusammenfassung wie `GET /api/summaries/years/:year`; Standard: vollständiges Jahr. */
function yearSummary(year: string, mean: number, overrides: Partial<YearSummary> = {}): YearSummary {
  return {
    id: year, year: Number(year), locationId: 1, daysExpected: 365, daysComplete: 365, monthsWithData: 12, complete: true,
    temperature: temperature(mean), precipitationSum: 812.4, dryDays: 140, meanMethod: 'mean_of_daily_means',
    ...overrides,
  };
}

function monthSummary(year: string, month: number, mean: number | null, precip: number | null): MonthSummary {
  return {
    id: `${year}-${String(month).padStart(2, '0')}`, year: Number(year), month, locationId: 1,
    daysExpected: 31, daysComplete: 31, complete: true, temperature: temperature(mean), precipitationSum: precip,
    dryDays: 10, meanMethod: 'mean_of_daily_means',
  };
}

/** Januar und Februar mit Daten (wie früher die Express-Antwort mit zwei Monaten). */
function months(year: string, mean = 5): MonthSummaryList {
  return { items: [monthSummary(year, 1, mean, 10), monthSummary(year, 2, mean + 1, 20)] };
}

const YEARS: YearList = {
  items: [
    { id: '2025', year: 2025, complete: true, daysComplete: 365 },
    { id: '2026', year: 2026, complete: false, daysComplete: 322 },
  ],
};

type SummaryFn = (year: string) => Observable<YearSummary>;
type MonthsFn = (year: string) => Observable<MonthSummaryList>;

/** WeatherService-Attrappe: Jahreszusammenfassung, Monate des Jahres und Jahresliste. */
function fakeApi(summaryOf: SummaryFn, monthsOf: MonthsFn = y => of(months(y)), years: () => Observable<YearList> = () => of(YEARS)) {
  return { getYearSummary: summaryOf, getMonthSummaries: monthsOf, getYearList: years };
}

/** Komponente ohne Router-Navigation; der Route-Parameter wird als Input gesetzt. */
function create(summaryOf: SummaryFn, monthsOf?: MonthsFn, years?: () => Observable<YearList>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: fakeApi(summaryOf, monthsOf, years) }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(YearlyPageComponent);
  fixture.detectChanges();
  return fixture;
}

/** Simuliert den Wechsel des Route-Parameters `:year`. */
function select(fixture: ComponentFixture<YearlyPageComponent>, year: string) {
  fixture.componentRef.setInput('year', year);
  fixture.detectChanges();
}

function harnessHelpers(harness: RouterTestingHarness) {
  const el = harness.fixture.nativeElement as HTMLElement;
  return {
    harness, el,
    router: TestBed.inject(Router),
    page: () => harness.routeDebugElement!.componentInstance as YearlyPageComponent,
    select: () => el.querySelector('select') as HTMLSelectElement,
    title: () => TestBed.inject(Title).getTitle(),
    settle: async () => { await harness.fixture.whenStable(); harness.detectChanges(); },
  };
}

/** App-Routen mit withComponentInputBinding(), Navigation wie im Browser. */
async function routed(summaryOf: SummaryFn, url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WeatherService, useValue: fakeApi(summaryOf) },
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, YearlyPageComponent);
  harness.detectChanges();
  return harnessHelpers(harness);
}

describe('YearlyPageComponent', () => {
  it('Vorbelegung ist das aktuelle Berliner Jahr, die Auswahl zeigt es an (V01)', () => {
    const fixture = create(y => of(yearSummary(y, 5)));
    const year = berlinToday().slice(0, 4);
    expect(fixture.componentInstance.selectedYear()).toBe(year);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')!.value).toBe(year);
  });

  it('Jahresliste aus /api/summaries/years, neuestes zuerst; kein Button „Laden“ (V15, F20)', () => {
    const fixture = create(y => of(yearSummary(y, 5)));
    select(fixture, '2025');
    expect(fixture.componentInstance.years()).toEqual(['2026', '2025']);
    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('#year-select option')).map(o => o.textContent?.trim());
    expect(options).toEqual(['2026', '2025']);
    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('Jahresliste fehlgeschlagen: Übergang von 2025 bis zum aktuellen Berliner Jahr (V18)', () => {
    const fixture = create(y => of(yearSummary(y, 5)), undefined, () => throwError(() => ({ status: 500 })));
    const current = parseInt(berlinToday().slice(0, 4), 10);
    expect(fixture.componentInstance.years()).toEqual(Array.from({ length: current - 2025 + 1 }, (_, i) => String(current - i)));
    expect(fixture.componentInstance.state()).toBe('success');
  });

  it('/jahr/2025 direkt: 2025 wird angezeigt, Auswahl navigiert über den Router, genau 1 Request-Satz je Wechsel (V08, F11)', async () => {
    const calls: string[] = [];
    const t = await routed(y => { calls.push(y); return of(yearSummary(y, 5)); }, '/jahr/2025');
    expect(t.router.url).toBe('/jahr/2025');
    expect(t.select().value).toBe('2025');
    expect(t.title()).toBe('2025 – Jahr – Wetter Heubach');
    expect(calls).toEqual(['2025']);

    const current = berlinToday().slice(0, 4);
    t.select().value = current;
    t.select().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe(`/jahr/${current}`);
    expect(calls).toEqual(['2025', current]);
    expect(t.title()).toBe(`${current} – Jahr – Wetter Heubach`);
  });

  it.each(['/jahr/1999', '/jahr/abc', '/jahr/2100'])('%s: Hinweis „Ungültiges Jahr“, kein Request, keine Umleitung', async url => {
    const calls: string[] = [];
    const t = await routed(y => { calls.push(y); return of(yearSummary(y, 5)); }, url);
    expect(calls).toEqual([]);
    expect(t.router.url).toBe(url);
    const hint = t.el.querySelector('app-notice.notice-error') as HTMLElement;
    expect(hint.textContent).toContain('Ungültiges Jahr');
    expect(hint.querySelector('a')?.getAttribute('href')).toBe('/jahr');
    expect(t.title()).toBe('Ungültiges Jahr – Wetter Heubach');
    expect(t.select().selectedOptions[0].textContent?.trim()).toBe('–');
  });

  it('Platzhalter verschwindet nach Wahl eines gültigen Jahres', async () => {
    const calls: string[] = [];
    const t = await routed(y => { calls.push(y); return of(yearSummary(y, 5)); }, '/jahr/1999');
    t.select().value = '2025';
    t.select().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/jahr/2025');
    expect(calls).toEqual(['2025']);
    expect(t.select().value).toBe('2025');
    expect(Array.from(t.select().options).some(o => o.textContent?.trim() === '–')).toBe(false);
  });

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create(y => y === '2025' ? throwError(() => ({ status: 500 })) : of(yearSummary(y, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.yearData()?.months.length).toBe(2);

    select(fixture, '2025');
    expect(c.state()).toBe('error');
    expect(c.yearData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.maxTemp()).toBeNull();
    expect(c.error()).toBe(YEAR_ERROR_MESSAGE);
    expect((fixture.nativeElement as HTMLElement).querySelector('.kpi-grid')).toBeNull();
  });

  it('Fehler der Monatsliste (zweiter Request) ergibt ebenfalls den Fehlerzustand', () => {
    const fixture = create(y => of(yearSummary(y, 5)), () => throwError(() => ({ status: 503 })));
    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.yearData()).toBeNull();
  });

  it('„Erneut versuchen“ lädt dasselbe Jahr noch einmal (B5.2, offener Punkt aus Schritt 0.3)', () => {
    const calls: string[] = [];
    let fail = true;
    const fixture = create(y => {
      calls.push(y);
      return fail ? throwError(() => ({ status: 500 })) : of(yearSummary(y, 5));
    });
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    expect(c.state()).toBe('error');
    const button = el.querySelector('app-error button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Erneut versuchen');

    fail = false;
    button.click();
    fixture.detectChanges();
    expect(calls).toEqual([c.selectedYear(), c.selectedYear()]);
    expect(c.state()).toBe('success');
    expect(c.yearData()?.months.length).toBe(2);
    expect(el.querySelector('app-error')).toBeNull();
  });

  it('404 der Jahreszusammenfassung ergibt empty und Daten null', () => {
    const fixture = create(y => y === '2025' ? throwError(() => ({ status: 404 })) : of(yearSummary(y, 5)));
    const c = fixture.componentInstance;
    select(fixture, '2025');
    expect(c.state()).toBe('empty');
    expect(c.yearData()).toBeNull();
    expect(c.error()).toBe(YEAR_EMPTY_MESSAGE);
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<YearSummary>>();
    const fixture = create(y => {
      const s = new Subject<YearSummary>();
      requests.set(y, s);
      return s;
    });
    const c = fixture.componentInstance;
    const current = berlinToday().slice(0, 4);

    select(fixture, '2025');
    select(fixture, current);

    const answer = (key: string, value: YearSummary) => { requests.get(key)!.next(value); requests.get(key)!.complete(); };
    answer(current, yearSummary(current, 4));
    answer('2025', yearSummary('2025', 9));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.summary()?.temperature.mean).toBe(4);
    expect(requests.get('2025')!.observed).toBe(false);
  });
});

describe('YearlyPageComponent Jahresachse, Kennzahlen und Chips (V21, F28, R13)', () => {
  it('volle Achse Jan–Dez, Monate ohne Daten sind null', () => {
    const fixture = create(y => of(yearSummary(y, 5)));
    const chart = fixture.componentInstance.chartData()!;
    expect(chart.labels).toEqual(['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']);
    expect(chart.temperatures.slice(0, 3)).toEqual([5, 6, null]);
    expect(chart.temperatures.slice(2)).toEqual(Array(10).fill(null));
    expect(chart.precipitations.slice(0, 3)).toEqual([10, 20, null]);
  });

  it('wärmster und kältester Monat tragen den Monatsnamen als Zusatzzeile', () => {
    const fixture = create(y => of(yearSummary(y, 5)));
    expect(fixture.componentInstance.warmestMonthName()).toBe('Februar');
    expect(fixture.componentInstance.coldestMonthName()).toBe('Januar');
    const metas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-kpi-card .kpi-meta')).map(m => m.textContent?.trim());
    expect(metas).toContain('Februar');
    expect(metas).toContain('Januar');
  });

  it('Ø Jahrestemperatur und Niederschlag aus der Jahreszusammenfassung, nicht aus den Monatsmitteln (F28, S8)', () => {
    // Monatsmittel 5 und 6 ergäben 5,5; die API liefert nach R12 11,6
    const fixture = create(y => of(yearSummary(y, 11.6, { precipitationSum: 701.6 })));
    const values = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-kpi-card .kpi-value')).map(v => v.textContent ?? '');
    expect(values[0]).toContain('11,6');
    expect(values[3]).toContain('702');
  });

  it('Monat mit mean = null zählt nicht als kältester Monat', () => {
    const fixture = create(
      y => of(yearSummary(y, 5)),
      y => of({ items: [monthSummary(y, 1, null, 3), monthSummary(y, 2, 4, 5), monthSummary(y, 3, 8, 1)] }),
    );
    expect(fixture.componentInstance.coldestMonthName()).toBe('Februar');
    expect(fixture.componentInstance.minTemp()).toBe(4);
    expect(fixture.componentInstance.warmestMonthName()).toBe('März');
  });

  it('complete = false: Chips „Unvollständig“ und „322 von 365 Tagen“', () => {
    const fixture = create(y => of(yearSummary(y, 11.6, { complete: false, daysComplete: 322, daysExpected: 365 })));
    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.page-title app-chip')).map(c => c.textContent?.trim());
    expect(chips).toEqual(['Unvollständig', '322 von 365 Tagen']);
  });

  it('complete = true: keine Chips', () => {
    const fixture = create(y => of(yearSummary(y, 5)));
    expect((fixture.nativeElement as HTMLElement).querySelector('.page-title app-chip')).toBeNull();
  });
});

describe('YearlyPageComponent gegen die neue API (HttpTestingController)', () => {
  async function routedHttp(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, YearlyPageComponent);
    harness.detectChanges();
    return { http, ...harnessHelpers(harness) };
  }

  it('/jahr/2025: Jahresliste und genau 2 Requests (Jahr, Monate); Diagramm mit 12 Monaten (US05-7)', async () => {
    const t = await routedHttp('/jahr/2025');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/years/2025').flush(yearSummary('2025', 10.1));
    t.http.expectOne('/api/summaries/months?year=2025').flush({
      items: Array.from({ length: 12 }, (_, i) => monthSummary('2025', i + 1, i, 10)),
    });
    await t.settle();
    t.http.verify();
    expect(Array.from(t.select().options).map(o => o.value)).toEqual(['2026', '2025']);
    const chart = t.page().chartData()!;
    expect(chart.labels).toHaveLength(12);
    expect(chart.temperatures.every(v => v !== null)).toBe(true);

    t.select().value = '2026';
    t.select().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/jahr/2026');
    const pending = t.http.match(() => true);
    expect(pending.map(r => r.request.urlWithParams)).toEqual(['/api/summaries/years/2026', '/api/summaries/months?year=2026']);
    pending[0].flush(yearSummary('2026', 11.6, { complete: false, daysComplete: 322, daysExpected: 365 }));
    pending[1].flush(months('2026'));
    await t.settle();
    t.http.verify();
    const chips = Array.from(t.el.querySelectorAll('.page-title app-chip')).map(c => c.textContent?.trim());
    expect(chips).toEqual(['Unvollständig', '322 von 365 Tagen']);
  });

  it('404 NO_DATA: Leerzustand, kein Diagramm', async () => {
    const t = await routedHttp('/jahr/2025');
    t.http.expectOne('/api/summaries/years').flush({ items: [] });
    t.http.expectOne('/api/summaries/years/2025').flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'Für das Jahr 2025 liegen keine Daten vor.', errors: [], details: { dataFrom: null } },
      { status: 404, statusText: 'Not Found' },
    );
    t.http.match(() => true).forEach(r => { if (!r.cancelled) r.flush({ items: [] }); });
    await t.settle();
    expect(t.page().state()).toBe('empty');
    expect(t.el.querySelector('app-empty')?.textContent).toContain(YEAR_EMPTY_MESSAGE);
    expect(t.el.querySelector('app-climate-chart')).toBeNull();
    // Leere Jahresliste: das gewählte gültige Jahr bleibt im Feld
    expect(t.select().value).toBe('2025');
  });

  it('500: Fehlerbox, „Erneut versuchen“ sendet dieselben 2 Requests noch einmal', async () => {
    const t = await routedHttp('/jahr/2025');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/years/2025').flush({}, { status: 500, statusText: 'Server Error' });
    t.http.match(() => true).forEach(r => { if (!r.cancelled) r.flush(months('2025')); });
    await t.settle();
    expect(t.page().state()).toBe('error');
    (t.el.querySelector('app-error button') as HTMLButtonElement).click();
    await t.settle();
    const again = t.http.match(() => true);
    expect(again.map(r => r.request.urlWithParams)).toEqual(['/api/summaries/years/2025', '/api/summaries/months?year=2025']);
    again[0].flush(yearSummary('2025', 5));
    again[1].flush(months('2025'));
    await t.settle();
    expect(t.page().state()).toBe('success');
    t.http.verify();
  });
});
