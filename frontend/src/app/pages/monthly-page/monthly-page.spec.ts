import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MONTH_EMPTY_MESSAGE, MONTH_ERROR_MESSAGE, MonthlyPageComponent } from './monthly-page';
import { WeatherService } from '../../services/weather.service';
import { DayList, DayListItem, MonthSummary, PeriodSummary, YearList } from '../../models/api';
import { berlinToday } from '../../utils/berlin-date';
import { routes } from '../../app.routes';
import { AppTitleStrategy, monthLabel } from '../../utils/page-title';
import { DataStatusService } from '../../services/data-status.service';
import { statusOf } from '../../testing/admin-fixtures';

function daysIn(year: string, month: string): number {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

/** Zusammenfassung wie `GET /api/summaries/months/:ym`; Standard: vollständiger Monat. */
function summary(year: string, month: string, mean: number, overrides: Partial<MonthSummary> = {}): MonthSummary {
  const days = daysIn(year, month);
  return {
    id: `${year}-${month}`, year: Number(year), month: Number(month), locationId: 1,
    daysExpected: days, daysComplete: days, complete: true,
    temperature: { mean, min: mean - 5, max: mean + 5, minAt: null, maxAt: null },
    precipitationSum: 42.3, dryDays: 10,
    indicators: { frostDays: 4, iceDays: 1, summerDays: 0, hotDays: 0, precipitationDays: days - 10 },
    meanMethod: 'mean_of_daily_means',
    ...overrides,
  };
}

function item(date: string, mean: number | null, precip: number | null): DayListItem {
  return {
    id: date, date, locationId: 1, hoursExpected: 24, hoursObserved: 24, complete: true,
    temperature: { mean, min: null, max: null }, precipitationSum: precip, isDryDay: null, hasCorrections: false,
  };
}

/** Tagesliste für die Tage `days` (Tag im Monat) des Monats von `from`. */
function dayList(from: string, to: string, days: number[] = [1, 2]): DayList {
  const items = days.map(d => item(`${from.slice(0, 8)}${String(d).padStart(2, '0')}`, 5 + d / 10, d));
  return { items, meta: { from, to, count: items.length } };
}

const YEARS: YearList = {
  items: [
    { id: '2025', year: 2025, complete: true, daysComplete: 365 },
    { id: '2026', year: 2026, complete: false, daysComplete: 322 },
  ],
};

type SummaryFn = (year: string, month: string) => Observable<MonthSummary>;
type DaysFn = (from: string, to: string) => Observable<DayList>;

/** WeatherService-Attrappe: Zusammenfassung je Monat, Tagesliste und Jahresliste. */
function fakeApi(summaryOf: SummaryFn, daysOf: DaysFn = (from, to) => of(dayList(from, to)), years: () => Observable<YearList> = () => of(YEARS)) {
  return {
    getMonthSummary: (ym: string) => summaryOf(ym.slice(0, 4), ym.slice(5, 7)),
    getDays: daysOf,
    getYearList: years,
  };
}

/** Komponente ohne Router-Navigation; die Route-Parameter werden als Inputs gesetzt. */
function create(summaryOf: SummaryFn, daysOf?: DaysFn, years?: () => Observable<YearList>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: fakeApi(summaryOf, daysOf, years) }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(MonthlyPageComponent);
  fixture.detectChanges();
  return fixture;
}

/** Simuliert den Wechsel der Route-Parameter `:year` und `:month`. */
function select(fixture: ComponentFixture<MonthlyPageComponent>, year: string, month?: string) {
  fixture.componentRef.setInput('year', year);
  if (month !== undefined) fixture.componentRef.setInput('month', month);
  fixture.detectChanges();
}

function harnessHelpers(harness: RouterTestingHarness) {
  const el = harness.fixture.nativeElement as HTMLElement;
  return {
    harness, el,
    router: TestBed.inject(Router),
    page: () => harness.routeDebugElement!.componentInstance as MonthlyPageComponent,
    selects: () => Array.from(el.querySelectorAll('select')) as HTMLSelectElement[],
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
  await harness.navigateByUrl(url, MonthlyPageComponent);
  harness.detectChanges();
  return harnessHelpers(harness);
}

describe('MonthlyPageComponent', () => {
  it('Vorbelegung ist der aktuelle Berliner Monat, die Auswahl zeigt ihn an (V01, F02)', () => {
    const calls: string[] = [];
    const fixture = create((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); });
    const c = fixture.componentInstance;
    const today = berlinToday();
    expect(c.selectedYear()).toBe(today.slice(0, 4));
    expect(c.selectedMonth()).toBe(today.slice(5, 7));
    expect(calls).toEqual([`${today.slice(0, 4)}/${today.slice(5, 7)}`]);

    const [yearSelect, monthSelect] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select'));
    expect(yearSelect.value).toBe(today.slice(0, 4));
    expect(monthSelect.value).toBe(today.slice(5, 7));
  });

  it('Jahreswechsel navigiert und lädt den sichtbaren Monat, die Monatsauswahl bleibt stehen (V01, V08)', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, '/monat');
    const c = t.page();
    const month = c.selectedMonth();
    const [yearSelect] = t.selects();
    const other = c.years()[1];

    yearSelect.value = other;
    yearSelect.dispatchEvent(new Event('change'));
    await t.settle();

    expect(t.router.url).toBe(`/monat/${other}/${month}`);
    expect(calls.at(-1)).toBe(`${other}/${month}`);
    expect(calls).toHaveLength(2);
    const [y2, m2] = t.selects();
    expect(y2.value).toBe(other);
    expect(m2.value).toBe(month);
  });

  it('Monatswechsel navigiert auf /monat/<Jahr>/<Monat>, genau 1 Request-Satz (V08)', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, '/monat/2025/03');
    const [, monthSelect] = t.selects();

    monthSelect.value = '04';
    monthSelect.dispatchEvent(new Event('change'));
    await t.settle();

    expect(t.router.url).toBe('/monat/2025/04');
    expect(calls).toEqual(['2025/03', '2025/04']);
    expect(t.title()).toBe('April 2025 – Monat – Wetter Heubach');
  });

  it('/monat/2025/03 direkt: März 2025 wird angezeigt, keine Umleitung (F11)', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, '/monat/2025/03');
    expect(t.router.url).toBe('/monat/2025/03');
    expect(calls).toEqual(['2025/03']);
    const [yearSelect, monthSelect] = t.selects();
    expect(yearSelect.value).toBe('2025');
    expect(monthSelect.value).toBe('03');
    expect(t.title()).toBe('März 2025 – Monat – Wetter Heubach');
  });

  it.each(['/monat/2025/13', '/monat/2025/3', '/monat/1999/01', '/monat/abc/01'])(
    '%s: Hinweis „Ungültiger Monat“, kein Request, keine Umleitung', async url => {
      const calls: string[] = [];
      const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, url);
      expect(calls).toEqual([]);
      expect(t.router.url).toBe(url);
      const hint = t.el.querySelector('app-notice.notice-error') as HTMLElement;
      expect(hint.textContent).toContain('Ungültiger Monat');
      expect(hint.querySelector('a')?.getAttribute('href')).toBe('/monat');
      expect(t.title()).toBe('Ungültiger Monat – Wetter Heubach');
    });

  it.each([
    ['/monat/2025/13', '2025', '–'],
    ['/monat/1999/03', '–', 'Mär'],
    ['/monat/abc/xy', '–', '–'],
  ])('%s: Selects zeigen den gültigen Teil, sonst den Platzhalter „–“', async (url, yearText, monthText) => {
    const t = await routed((y, m) => of(summary(y, m, 5)), url);
    const [yearSelect, monthSelect] = t.selects();
    expect(yearSelect.selectedOptions[0].textContent?.trim()).toBe(yearText);
    expect(monthSelect.selectedOptions[0].textContent?.trim()).toBe(monthText);
  });

  it('Platzhalter verschwindet nach Wahl eines gültigen Monats', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, '/monat/2025/13');
    const [, monthSelect] = t.selects();
    monthSelect.value = '04';
    monthSelect.dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/monat/2025/04');
    expect(calls).toEqual(['2025/04']);
    const [y2, m2] = t.selects();
    expect(Array.from(m2.options).some(o => o.textContent?.trim() === '–')).toBe(false);
    expect(y2.value).toBe('2025');
    expect(m2.value).toBe('04');
    expect(t.el.querySelector('app-notice.notice-error')).toBeNull();
  });

  it('Monat nach dem laufenden (nur per URL): kein Request, Leerzustand „noch keine Daten“', async () => {
    const today = berlinToday();
    // Im Dezember liegt der Folgemonat im nächsten Jahr, das schon die Param-Prüfung ablehnt
    if (today.slice(5, 7) === '12') return;
    const year = today.slice(0, 4);
    const next = String(Number(today.slice(5, 7)) + 1).padStart(2, '0');
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(summary(y, m, 5)); }, `/monat/${year}/${next}`);
    expect(calls).toEqual([]);
    expect(t.page().state()).toBe('empty');
    expect(t.el.querySelector('app-empty')?.textContent).toContain(`Für ${monthLabel(year, next)} liegen noch keine Daten vor.`);
    expect(t.el.querySelector('app-error')).toBeNull();
  });

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create((y, m) => y === '2025' && m === '03'
      ? throwError(() => ({ status: 500 }))
      : of(summary(y, m, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.monthData()?.days.length).toBe(2);

    select(fixture, '2025', '03');
    expect(c.state()).toBe('error');
    expect(c.monthData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.error()).toBe(MONTH_ERROR_MESSAGE);
    expect((fixture.nativeElement as HTMLElement).querySelector('.kpi-grid')).toBeNull();
  });

  it('Fehler der Tagesliste (zweiter Request) ergibt ebenfalls den Fehlerzustand', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)), () => throwError(() => ({ status: 503 })));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('error');
    expect(c.monthData()).toBeNull();
  });

  it('„Erneut versuchen“ lädt denselben Monat noch einmal (B5.2, offener Punkt aus Schritt 0.3)', () => {
    const calls: string[] = [];
    let fail = true;
    const fixture = create((y, m) => {
      calls.push(`${y}/${m}`);
      return fail ? throwError(() => ({ status: 500 })) : of(summary(y, m, 5));
    });
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    expect(c.state()).toBe('error');
    const button = el.querySelector('app-error button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Erneut versuchen');

    fail = false;
    button.click();
    fixture.detectChanges();
    const current = `${c.selectedYear()}/${c.selectedMonth()}`;
    expect(calls).toEqual([current, current]);
    expect(c.state()).toBe('success');
    expect(c.monthData()?.days.length).toBe(2);
    expect(el.querySelector('app-error')).toBeNull();
  });

  it('404 der Zusammenfassung ergibt empty und Daten null', () => {
    const fixture = create((y, m) => y === '2025'
      ? throwError(() => ({ status: 404 }))
      : of(summary(y, m, 5)));
    const c = fixture.componentInstance;
    select(fixture, '2025');
    expect(c.state()).toBe('empty');
    expect(c.monthData()).toBeNull();
    expect(c.error()).toBe(MONTH_EMPTY_MESSAGE);
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<MonthSummary>>();
    const fixture = create((y, m) => {
      const s = new Subject<MonthSummary>();
      requests.set(`${y}/${m}`, s);
      return s;
    });
    const c = fixture.componentInstance;

    select(fixture, '2025', '01');
    select(fixture, '2025', '02');

    const answer = (key: string, value: MonthSummary) => { requests.get(key)!.next(value); requests.get(key)!.complete(); };
    answer('2025/02', summary('2025', '02', 2));
    answer('2025/01', summary('2025', '01', 1));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.summary()?.temperature.mean).toBe(2);
    expect(requests.get('2025/01')!.observed).toBe(false);
  });

  it('Jahresliste aus /api/summaries/years, neuestes zuerst (F20)', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)));
    select(fixture, '2025', '03');
    expect(fixture.componentInstance.years()).toEqual(['2026', '2025']);
    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('#year-select option')).map(o => o.textContent?.trim());
    expect(options).toEqual(['2026', '2025']);
  });

  it('Jahresliste fehlgeschlagen: Übergang von 2025 bis zum aktuellen Berliner Jahr (V18)', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)), undefined, () => throwError(() => ({ status: 500 })));
    const current = parseInt(berlinToday().slice(0, 4), 10);
    const expected = Array.from({ length: current - 2025 + 1 }, (_, i) => String(current - i));
    expect(fixture.componentInstance.years()).toEqual(expected);
    expect(fixture.componentInstance.state()).toBe('success');
  });

  it('kein Button „Laden“ (einziger Button ist der Schalter-Chip), Selects haben sichtbare Labels (V15, V22)', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)));
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim())).toEqual(['Vorjahr vergleichen']);
    expect(el.querySelector('label[for="year-select"]')).not.toBeNull();
    expect(el.querySelector('label[for="month-select"]')).not.toBeNull();
  });
});

describe('MonthlyPageComponent Kennzahlen und Chips aus der Zusammenfassung (S8, R13)', () => {
  it('Kennzahlen kommen unverändert aus der API, keine eigene Rechnung', () => {
    const fixture = create(
      (y, m) => of(summary(y, m, 7.25, { precipitationSum: 12.4, daysComplete: 31 })),
      // Tageswerte, deren Mittel und Summe von der Zusammenfassung abweichen
      (from, to) => of({ items: [item(`${from.slice(0, 8)}01`, 1, 100), item(`${from.slice(0, 8)}02`, 3, 200)], meta: { from, to, count: 2 } }),
    );
    select(fixture, '2025', '03');
    const values = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-kpi-card .kpi-value')).map(v => v.textContent ?? '');
    expect(values[0]).toContain('7,3');
    expect(values[1]).toContain('12,4');
    expect(values[2]).toContain('31');
    const kickers = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-kpi-card .kpi-kicker')).map(k => k.textContent?.trim());
    expect(kickers.slice(0, 3)).toEqual(['Ø Temperatur', 'Gesamtniederschlag', 'Vollständige Tage']);
  });

  it('Kenntag-Karten (N05, US18-5) aus indicators und dryDays, mit Hinweis bei unvollständigem Monat', () => {
    const fixture = create((y, m) => of(summary(y, m, 5, {
      complete: false, daysComplete: 18, daysExpected: 30, dryDays: 11,
      indicators: { frostDays: 6, iceDays: 2, summerDays: 0, hotDays: 0, precipitationDays: 7 },
    })));
    select(fixture, '2026', '11');
    const section = (fixture.nativeElement as HTMLElement).querySelector('app-indicator-cards section')!;
    expect(section.querySelector('h2')?.textContent?.trim()).toBe('Kenntage');
    const kickers = Array.from(section.querySelectorAll('.kpi-kicker')).map(k => k.textContent?.trim());
    expect(kickers).toEqual(['Frosttage', 'Eistage', 'Sommertage', 'Heiße Tage', 'Niederschlagstage', 'Trockentage']);
    const values = Array.from(section.querySelectorAll('.kpi-value .num')).map(v => v.textContent?.trim());
    expect(values).toEqual(['6', '2', '0', '0', '7', '11']);
    expect(section.querySelector('.kpi-section-hint')?.textContent).toContain('18 vollständigen Tage von 30');
  });

  it('Leer- und Fehlerzustand: keine Kenntag-Karten und kein Schalter-Chip', () => {
    const fixture = create((y, m) => y === '2025' ? throwError(() => ({ status: 404 })) : of(summary(y, m, 5)));
    select(fixture, '2025', '03');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-indicator-cards')).toBeNull();
    expect(el.querySelector('app-toggle-chip')).toBeNull();
  });

  it('complete = false: Chips „Unvollständig“ und „18 von 30 Tagen“ (daysComplete/daysExpected)', () => {
    const fixture = create((y, m) => of(summary(y, m, 5, { complete: false, daysComplete: 18, daysExpected: 30 })));
    select(fixture, '2025', '11');
    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.page-title app-chip')).map(c => c.textContent?.trim());
    expect(chips).toEqual(['Unvollständig', '18 von 30 Tagen']);
  });

  it('complete = true: keine Chips', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)));
    select(fixture, '2025', '03');
    expect((fixture.nativeElement as HTMLElement).querySelector('.page-title app-chip')).toBeNull();
  });
});

describe('MonthlyPageComponent Monatsachse (V21)', () => {
  /** Tagesliste für den 1. bis `last`. eines Monats, wie im laufenden Monat. */
  const untilDay = (last: number): DaysFn => (from, to) => of(dayList(from, to, Array.from({ length: last }, (_, i) => i + 1)));

  it('laufender Monat (November, Daten bis 19.): 30 Labels, danach null als Lücke', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)), untilDay(19));
    select(fixture, '2026', '11');
    const chart = fixture.componentInstance.chartData()!;
    expect(chart.labels).toHaveLength(30);
    expect(chart.labels[0]).toBe('1.');
    expect(chart.labels[29]).toBe('30.');
    expect(chart.temperatures).toHaveLength(30);
    expect(chart.temperatures.slice(0, 19).every(v => v !== null)).toBe(true);
    expect(chart.temperatures.slice(19)).toEqual(Array(11).fill(null));
    expect(chart.precipitations.slice(19)).toEqual(Array(11).fill(null));
  });

  it('die Achse folgt der Monatslänge: Dezember hat 31 Tage', () => {
    const fixture = create((y, m) => of(summary(y, m, 5)), untilDay(5));
    select(fixture, '2025', '12');
    expect(fixture.componentInstance.chartData()!.labels).toHaveLength(31);
  });

  it('Tage ohne Daten mitten im Monat sind ebenfalls null', () => {
    const fixture = create(
      (y, m) => of(summary(y, m, 5)),
      (from, to) => of({ items: [item(`${from.slice(0, 8)}01`, 3, 0), item(`${from.slice(0, 8)}03`, 4, 1)], meta: { from, to, count: 2 } }),
    );
    select(fixture, '2025', '03');
    const chart = fixture.componentInstance.chartData()!;
    expect(chart.labels).toHaveLength(31);
    expect(chart.temperatures.slice(0, 4)).toEqual([3, null, 4, null]);
  });
});

describe('MonthlyPageComponent gegen die neue API (HttpTestingController)', () => {
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
    await harness.navigateByUrl(url, MonthlyPageComponent);
    harness.detectChanges();
    return { http, ...harnessHelpers(harness) };
  }

  it('/monat/2025/03 → April: genau 2 Requests (Zusammenfassung, Tage 01.–30.), x-Achse 1.–30. (US04-10)', async () => {
    const t = await routedHttp('/monat/2025/03');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2025-03').flush(summary('2025', '03', 5));
    t.http.expectOne('/api/days?from=2025-03-01&to=2025-03-31').flush(dayList('2025-03-01', '2025-03-31'));
    await t.settle();
    t.http.verify();
    const [yearSelect, monthSelect] = t.selects();
    expect(yearSelect.value).toBe('2025');
    expect(monthSelect.value).toBe('03');
    expect(Array.from(yearSelect.options).map(o => o.value)).toEqual(['2026', '2025']);

    monthSelect.value = '04';
    monthSelect.dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/monat/2025/04');
    const pending = t.http.match(() => true);
    expect(pending.map(r => r.request.urlWithParams)).toEqual([
      '/api/summaries/months/2025-04',
      '/api/days?from=2025-04-01&to=2025-04-30',
    ]);
    pending[0].flush(summary('2025', '04', 9));
    pending[1].flush(dayList('2025-04-01', '2025-04-30'));
    await t.settle();
    t.http.verify();

    const chart = t.page().chartData()!;
    expect(chart.labels).toHaveLength(30);
    expect(chart.labels[0]).toBe('1.');
    expect(chart.labels[29]).toBe('30.');
  });

  it('laufender Monat: Tagesliste bis heute (to = min(Monatsende, heute), US04-9), Chips bei complete = false', async () => {
    const today = berlinToday();
    const [y, m] = [today.slice(0, 4), today.slice(5, 7)];
    const t = await routedHttp(`/monat/${y}/${m}`);
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne(`/api/summaries/months/${y}-${m}`)
      .flush(summary(y, m, 5, { complete: false, daysComplete: 18, daysExpected: daysIn(y, m) }));
    t.http.expectOne(`/api/days?from=${y}-${m}-01&to=${today}`).flush(dayList(`${y}-${m}-01`, today));
    await t.settle();
    t.http.verify();
    const chips = Array.from(t.el.querySelectorAll('.page-title app-chip')).map(c => c.textContent?.trim());
    expect(chips).toEqual(['Unvollständig', `18 von ${daysIn(y, m)} Tagen`]);
    expect(t.page().chartData()!.labels).toHaveLength(daysIn(y, m));
  });

  it('404 NO_DATA der Zusammenfassung: Leerzustand, kein Diagramm', async () => {
    const t = await routedHttp('/monat/2025/02');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2025-02').flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'Für Februar 2025 liegen keine Daten vor.', errors: [], details: { dataFrom: '2025-01-01' } },
      { status: 404, statusText: 'Not Found' },
    );
    t.http.match('/api/days?from=2025-02-01&to=2025-02-28').forEach(r => { if (!r.cancelled) r.flush(dayList('2025-02-01', '2025-02-28', [])); });
    await t.settle();
    expect(t.page().state()).toBe('empty');
    expect(t.el.querySelector('app-empty')?.textContent).toContain(MONTH_EMPTY_MESSAGE);
    expect(t.el.querySelector('app-climate-chart')).toBeNull();
  });

  it('400 der API (z. B. DATE_IN_FUTURE): Meldung der API, ohne „Erneut versuchen“', async () => {
    const t = await routedHttp('/monat/2025/02');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/days?from=2025-02-01&to=2025-02-28').flush(
      {
        statusCode: 400, error: 'Bad Request', code: 'DATE_IN_FUTURE', message: 'Das Datum liegt in der Zukunft.',
        errors: [{ field: 'to', code: 'DATE_IN_FUTURE', message: 'Das Datum liegt in der Zukunft.' }], details: null,
      },
      { status: 400, statusText: 'Bad Request' },
    );
    t.http.match('/api/summaries/months/2025-02').forEach(r => { if (!r.cancelled) r.flush(summary('2025', '02', 1)); });
    await t.settle();
    expect(t.page().state()).toBe('error');
    expect(t.el.querySelector('app-error')?.textContent).toContain('Das Datum liegt in der Zukunft.');
    expect(t.el.querySelector('app-error button')).toBeNull();
  });

  it('500: Fehlerbox, „Erneut versuchen“ sendet dieselben 2 Requests noch einmal', async () => {
    const t = await routedHttp('/monat/2025/03');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2025-03').flush({}, { status: 500, statusText: 'Server Error' });
    t.http.match(() => true).forEach(r => { if (!r.cancelled) r.flush(dayList('2025-03-01', '2025-03-31')); });
    await t.settle();
    expect(t.page().state()).toBe('error');
    (t.el.querySelector('app-error button') as HTMLButtonElement).click();
    await t.settle();
    const again = t.http.match(() => true);
    expect(again.map(r => r.request.urlWithParams)).toEqual([
      '/api/summaries/months/2025-03',
      '/api/days?from=2025-03-01&to=2025-03-31',
    ]);
    again[0].flush(summary('2025', '03', 5));
    again[1].flush(dayList('2025-03-01', '2025-03-31'));
    await t.settle();
    expect(t.page().state()).toBe('success');
    t.http.verify();
  });
});

describe('MonthlyPageComponent: heute laut Server (03 B4.8, Schritt 12a)', () => {
  it('/monat wartet auf /api/status und fragt dann den Server-Monat mit to = status.today ab (kein 400 bei FAKE_NOW)', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(DataStatusService).load(); // wie App beim Start
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/monat', MonthlyPageComponent);
    harness.detectChanges();
    const t = harnessHelpers(harness);
    http.expectOne('/api/summaries/years').flush(YEARS);
    // Solange /api/status lädt: kein Request mit dem Browser-Datum
    http.expectNone(r => r.url.startsWith('/api/summaries/months') || r.url === '/api/days');
    http.expectOne('/api/status').flush(statusOf({ today: '2026-11-19' }));
    await t.settle();
    http.expectOne('/api/summaries/months/2026-11').flush(summary('2026', '11', 6, { complete: false, daysComplete: 18 }));
    http.expectOne('/api/days?from=2026-11-01&to=2026-11-19').flush(dayList('2026-11-01', '2026-11-19'));
    await t.settle();
    expect(t.page().selectedMonth()).toBe('11');
    expect(t.page().state()).toBe('success');
    http.verify();
  });
});

describe('MonthlyPageComponent: Vorjahresvergleich (N06, R29, US19-9)', () => {
  const TODAY = '2026-11-19';
  const YEARS_WITH_2024: YearList = { items: [{ id: '2024', year: 2024, complete: true, daysComplete: 366 }, ...YEARS.items] };

  /** Zeitraum wie `GET /api/summaries/periods?from&to`. */
  function period(from: string, to: string, mean: number, precipitationSum: number): PeriodSummary {
    const { year: _year, month: _month, ...rest } = summary(from.slice(0, 4), from.slice(5, 7), mean, { precipitationSum });
    return { ...rest, id: `${from}..${to}`, from, to };
  }

  async function routedHttp(url: string, today = TODAY) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    // Heute laut Server wie mit FAKE_NOW=2026-11-19T13:30:00Z (unabhängig von der Uhr des Rechners)
    TestBed.inject(DataStatusService).status.set(statusOf({ today }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, MonthlyPageComponent);
    harness.detectChanges();
    const t = harnessHelpers(harness);
    return {
      http, ...t,
      chip: () => t.el.querySelector('app-toggle-chip button') as HTMLButtonElement,
      hint: () => t.el.querySelector('#compare-hint')?.textContent?.trim() ?? '',
      metas: () => Array.from(t.el.querySelectorAll('.kpi-grid')[0].querySelectorAll('.kpi-meta')).map(m => m.textContent?.trim()),
      /** Alle offenen Requests (werden dabei aus dem Controller genommen und hier beantwortet). */
      pending: () => http.match(() => true),
    };
  }

  type Harness = Awaited<ReturnType<typeof routedHttp>>;

  /** Genau diese Requests sind offen (in dieser Reihenfolge); gibt sie zum Beantworten zurück. */
  function expectPending(t: Harness, urls: string[]) {
    const pending = t.pending();
    expect(pending.map(r => r.request.urlWithParams)).toEqual(urls);
    return pending;
  }

  /** November 2026 laufend: Jahresliste, Zusammenfassung und Tage bis heute. */
  async function november(url = '/monat/2026/11') {
    const t = await routedHttp(url);
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2026-11').flush(summary('2026', '11', 6.3, { complete: false, daysComplete: 18 }));
    t.http.expectOne('/api/days?from=2026-11-01&to=2026-11-19').flush(dayList('2026-11-01', '2026-11-19'));
    await t.settle();
    return t;
  }

  /**
   * Prüft, dass genau die Vergleichs-Requests des laufenden Novembers offen sind (2 × `/periods` mit R29-Zeiträumen,
   * Tage des Vorjahresmonats für die Linie; kein neuer Request-Satz für den Monat), und beantwortet sie.
   */
  async function flushNovemberCompare(t: Harness) {
    const pending = t.pending();
    expect(pending.map(r => r.request.urlWithParams)).toEqual([
      '/api/summaries/periods?from=2026-11-01&to=2026-11-18',
      '/api/summaries/periods?from=2025-11-01&to=2025-11-18',
      '/api/days?from=2025-11-01&to=2025-11-30',
    ]);
    pending[0].flush(period('2026-11-01', '2026-11-18', 6.3, 40.2));
    pending[1].flush(period('2025-11-01', '2025-11-18', 5.9, 52.5));
    pending[2].flush(dayList('2025-11-01', '2025-11-30', [1, 2, 3]));
    await t.settle();
  }

  it('Klick (US19-9): aria-pressed, URL ?vergleich=vorjahr, genau 2 Requests auf /periods, Differenz, gestrichelte Linie', async () => {
    const t = await november();
    t.http.verify();
    expect(t.chip().getAttribute('aria-pressed')).toBe('false');
    expect(t.chip().textContent?.trim()).toBe('Vorjahr vergleichen');

    t.chip().click();
    await t.settle();
    expect(t.router.url).toBe('/monat/2026/11?vergleich=vorjahr');
    expect(t.chip().getAttribute('aria-pressed')).toBe('true');
    expect(t.hint()).toBe('Vorjahr wird geladen …');
    await flushNovemberCompare(t);
    t.http.verify();

    expect(t.metas()[0]).toBe('+0,4 °C wärmer als 01.–18.11.2025');
    expect(t.metas()[1]).toBe('−12,3 mm trockener als 01.–18.11.2025');
    expect(t.hint()).toBe('Verglichen mit 01.–18.11.2025');
    const chart = t.page().chartData()!;
    expect(chart.compare?.label).toBe('November 2025');
    expect(chart.compare?.temperatures).toHaveLength(30);
    expect(chart.compare?.temperatures.slice(0, 4)).toEqual([5.1, 5.2, 5.3, null]);
    const legend = Array.from(t.el.querySelectorAll('.chart-legend li')).map(li => li.textContent?.trim());
    expect(legend).toContain('Temperatur November 2025 (°C), gestrichelte Linie');
    const heads = Array.from(t.el.querySelectorAll('app-climate-chart thead th')).map(th => th.textContent?.trim());
    expect(heads).toEqual(['Tag', 'Temperatur', 'Temperatur November 2025', 'Niederschlag']);
    expect(t.el.querySelector('app-error')).toBeNull();
  });

  it('F5 mit ?vergleich=vorjahr: der Vergleich ist sofort wieder aktiv (US19-8, Zustand in der URL)', async () => {
    const t = await november('/monat/2026/11?vergleich=vorjahr');
    expect(t.chip().getAttribute('aria-pressed')).toBe('true');
    await flushNovemberCompare(t);
    t.http.verify();
    expect(t.page().chartData()!.compare).toBeDefined();
    expect(t.metas()[0]).toContain('wärmer als 01.–18.11.2025');
  });

  it('zweiter Klick schaltet aus: Query entfällt, Linie und Differenz verschwinden, kein Request', async () => {
    const t = await november('/monat/2026/11?vergleich=vorjahr');
    await flushNovemberCompare(t);
    t.chip().click();
    await t.settle();
    expect(t.router.url).toBe('/monat/2026/11');
    expect(t.chip().getAttribute('aria-pressed')).toBe('false');
    expect(t.page().chartData()!.compare).toBeUndefined();
    expect(t.metas()[0]).toBe('');
    expect(t.hint()).toBe('');
    t.http.verify();
  });

  it('vollständiger Monat: Vorjahresmonat über /summaries/months, kein /periods; Differenz zur Zusammenfassung der Seite', async () => {
    const t = await routedHttp('/monat/2025/03?vergleich=vorjahr');
    t.http.expectOne('/api/summaries/years').flush(YEARS_WITH_2024);
    t.http.expectOne('/api/summaries/months/2025-03').flush(summary('2025', '03', 7.2, { precipitationSum: 30 }));
    t.http.expectOne('/api/days?from=2025-03-01&to=2025-03-31').flush(dayList('2025-03-01', '2025-03-31'));
    await t.settle();
    const [previous, days] = expectPending(t, ['/api/summaries/months/2024-03', '/api/days?from=2024-03-01&to=2024-03-31']);
    previous.flush(summary('2024', '03', 8.4, { precipitationSum: 30 }));
    days.flush(dayList('2024-03-01', '2024-03-31'));
    await t.settle();
    t.http.verify();
    expect(t.metas()[0]).toBe('−1,2 °C kälter als März 2024');
    expect(t.metas()[1]).toBe('gleich viel Niederschlag wie März 2024');
    expect(t.page().chartData()!.compare?.label).toBe('März 2024');
  });

  it('Vorjahr ohne Daten (404): Chip deaktiviert mit „Kein Vorjahr mit Daten“, kein Fehlerzustand (R29)', async () => {
    const t = await routedHttp('/monat/2026/02?vergleich=vorjahr');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2026-02').flush(summary('2026', '02', 2));
    t.http.expectOne('/api/days?from=2026-02-01&to=2026-02-28').flush(dayList('2026-02-01', '2026-02-28'));
    await t.settle();
    t.http.expectOne('/api/summaries/months/2025-02').flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'Für Februar 2025 liegen keine Daten vor.', errors: [], details: null },
      { status: 404, statusText: 'Not Found' },
    );
    t.http.match('/api/days?from=2025-02-01&to=2025-02-28').forEach(r => { if (!r.cancelled) r.flush(dayList('2025-02-01', '2025-02-28', [])); });
    await t.settle();
    expect(t.chip().getAttribute('aria-disabled')).toBe('true');
    expect(t.chip().getAttribute('aria-pressed')).toBe('false');
    expect(t.hint()).toBe('Kein Vorjahr mit Daten');
    expect(t.chip().getAttribute('aria-describedby')).toBe('compare-hint');
    expect(t.page().state()).toBe('success');
    expect(t.el.querySelector('app-error')).toBeNull();
    expect(t.page().chartData()!.compare).toBeUndefined();
    // Kein erneuter Versuch
    t.http.verify();
  });

  it('Vorjahr nicht in der Jahresliste: Chip deaktiviert ohne Request, Klick ändert die URL nicht', async () => {
    const t = await routedHttp('/monat/2025/03');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2025-03').flush(summary('2025', '03', 5));
    t.http.expectOne('/api/days?from=2025-03-01&to=2025-03-31').flush(dayList('2025-03-01', '2025-03-31'));
    await t.settle();
    expect(t.chip().getAttribute('aria-disabled')).toBe('true');
    expect(t.hint()).toBe('Kein Vorjahr mit Daten');
    t.chip().click();
    await t.settle();
    expect(t.router.url).toBe('/monat/2025/03');
    t.http.verify();
  });

  it('anderer Fehler beim Vorjahr: Hinweis neben dem Chip, Seite bleibt im Erfolgszustand', async () => {
    const t = await november('/monat/2026/11?vergleich=vorjahr');
    t.http.match(r => r.url === '/api/summaries/periods')[0].flush({}, { status: 500, statusText: 'Server Error' });
    t.http.match(() => true).forEach(r => { if (!r.cancelled) r.flush({}); });
    await t.settle();
    expect(t.hint()).toBe('Der Vorjahresvergleich konnte nicht geladen werden.');
    expect(t.chip().getAttribute('aria-pressed')).toBe('true');
    expect(t.chip().hasAttribute('aria-disabled')).toBe(false);
    expect(t.page().state()).toBe('success');
    expect(t.el.querySelector('app-error')).toBeNull();
  });

  it('Monatswechsel behält ?vergleich=vorjahr und vergleicht den neuen Monat (erst Monat, dann Vergleich)', async () => {
    const t = await routedHttp('/monat/2025/04?vergleich=vorjahr');
    t.http.expectOne('/api/summaries/years').flush(YEARS_WITH_2024);
    t.http.expectOne('/api/summaries/months/2025-04').flush(summary('2025', '04', 9));
    t.http.expectOne('/api/days?from=2025-04-01&to=2025-04-30').flush(dayList('2025-04-01', '2025-04-30'));
    await t.settle();
    t.http.expectOne('/api/summaries/months/2024-04').flush(summary('2024', '04', 9));
    t.http.expectOne('/api/days?from=2024-04-01&to=2024-04-30').flush(dayList('2024-04-01', '2024-04-30'));
    await t.settle();
    const [, monthSelect] = t.selects();
    monthSelect.value = '05';
    monthSelect.dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/monat/2025/05?vergleich=vorjahr');
    const [month, monthDays] = expectPending(t, ['/api/summaries/months/2025-05', '/api/days?from=2025-05-01&to=2025-05-31']);
    month.flush(summary('2025', '05', 12));
    monthDays.flush(dayList('2025-05-01', '2025-05-31'));
    await t.settle();
    const [previous, previousDays] = expectPending(t, ['/api/summaries/months/2024-05', '/api/days?from=2024-05-01&to=2024-05-31']);
    previous.flush(summary('2024', '05', 11));
    previousDays.flush(dayList('2024-05-01', '2024-05-31'));
    await t.settle();
    t.http.verify();
    expect(t.metas()[0]).toBe('+1,0 °C wärmer als Mai 2024');
  });

  it('heute ist der 1. des Monats: Chip deaktiviert, „Noch kein vollständiger Tag zum Vergleichen“, kein Request', async () => {
    const t = await routedHttp('/monat/2026/11?vergleich=vorjahr', '2026-11-01');
    t.http.expectOne('/api/summaries/years').flush(YEARS);
    t.http.expectOne('/api/summaries/months/2026-11').flush(summary('2026', '11', 6, { complete: false, daysComplete: 0 }));
    t.http.expectOne('/api/days?from=2026-11-01&to=2026-11-01').flush(dayList('2026-11-01', '2026-11-01', [1]));
    await t.settle();
    expect(t.chip().getAttribute('aria-disabled')).toBe('true');
    expect(t.hint()).toBe('Noch kein vollständiger Tag zum Vergleichen');
    t.http.verify();
  });
});
