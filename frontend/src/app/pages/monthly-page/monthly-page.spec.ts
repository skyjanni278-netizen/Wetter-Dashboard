import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MonthlyPageComponent } from './monthly-page';
import { WeatherService } from '../../services/weather.service';
import { MonthResponse } from '../../models/weather';
import { berlinToday } from '../../utils/berlin-date';
import { routes } from '../../app.routes';
import { AppTitleStrategy } from '../../utils/page-title';

function response(year: string, month: string, avgTemp: number): MonthResponse {
  return { year, month, data: [{ day: 1, avgTemp, totalPrecip: 1 }, { day: 2, avgTemp, totalPrecip: 2 }] };
}

/** Komponente ohne Router-Navigation; die Route-Parameter werden als Inputs gesetzt. */
function create(getMonth: (year: string, month: string) => Observable<MonthResponse>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: { getMonth } }, provideRouter([])],
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

/** App-Routen mit withComponentInputBinding(), Navigation wie im Browser. */
async function routed(getMonth: (year: string, month: string) => Observable<MonthResponse>, url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WeatherService, useValue: { getMonth } },
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, MonthlyPageComponent);
  harness.detectChanges();
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

describe('MonthlyPageComponent', () => {
  it('Vorbelegung ist der aktuelle Berliner Monat, die Auswahl zeigt ihn an (V01, F02)', () => {
    const calls: string[] = [];
    const fixture = create((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); });
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
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); }, '/monat');
    const c = t.page();
    const month = c.selectedMonth();
    const [yearSelect] = t.selects();

    yearSelect.value = c.years[1];
    yearSelect.dispatchEvent(new Event('change'));
    await t.settle();

    expect(t.router.url).toBe(`/monat/${c.years[1]}/${month}`);
    expect(calls.at(-1)).toBe(`${c.years[1]}/${month}`);
    expect(calls).toHaveLength(2);
    const [y2, m2] = t.selects();
    expect(y2.value).toBe(c.years[1]);
    expect(m2.value).toBe(month);
  });

  it('Monatswechsel navigiert auf /monat/<Jahr>/<Monat>, genau 1 Request (V08)', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); }, '/monat/2025/03');
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
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); }, '/monat/2025/03');
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
      const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); }, url);
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
    const t = await routed((y, m) => of(response(y, m, 5)), url);
    const [yearSelect, monthSelect] = t.selects();
    expect(yearSelect.selectedOptions[0].textContent?.trim()).toBe(yearText);
    expect(monthSelect.selectedOptions[0].textContent?.trim()).toBe(monthText);
  });

  it('Platzhalter verschwindet nach Wahl eines gültigen Monats', async () => {
    const calls: string[] = [];
    const t = await routed((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); }, '/monat/2025/13');
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

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create((y, m) => y === '2025' && m === '03'
      ? throwError(() => ({ status: 500 }))
      : of(response(y, m, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.monthData()?.length).toBe(2);

    select(fixture, '2025', '03');
    expect(c.state()).toBe('error');
    expect(c.monthData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.error()).toBe('Fehler beim Laden der Monatsdaten.');
    expect((fixture.nativeElement as HTMLElement).querySelector('.kpi-grid')).toBeNull();
  });

  it('leere Antwort ergibt empty und Daten null', () => {
    const fixture = create((y, m) => y === '2025'
      ? of({ year: y, month: m, data: [] })
      : of(response(y, m, 5)));
    const c = fixture.componentInstance;
    select(fixture, '2025');
    expect(c.state()).toBe('empty');
    expect(c.monthData()).toBeNull();
    expect(c.error()).toBe('Keine gespeicherten Daten für diesen Monat.');
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<MonthResponse>>();
    const fixture = create((y, m) => {
      const s = new Subject<MonthResponse>();
      requests.set(`${y}/${m}`, s);
      return s;
    });
    const c = fixture.componentInstance;

    select(fixture, '2025', '01');
    select(fixture, '2025', '02');

    requests.get('2025/02')!.next(response('2025', '02', 2));
    requests.get('2025/01')!.next(response('2025', '01', 1));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.monthData()?.[0].avgTemp).toBe(2);
    expect(requests.get('2025/01')!.observed).toBe(false);
  });

  it('Jahresliste reicht von 2025 bis zum aktuellen Berliner Jahr (V18, F20)', () => {
    const fixture = create((y, m) => of(response(y, m, 5)));
    const current = parseInt(berlinToday().slice(0, 4), 10);
    const expected = Array.from({ length: current - 2025 + 1 }, (_, i) => String(current - i));
    expect(fixture.componentInstance.years).toEqual(expected);
    expect(fixture.componentInstance.years.at(-1)).toBe('2025');
  });

  it('kein Button „Laden“, Selects haben sichtbare Labels (V15, V22)', () => {
    const fixture = create((y, m) => of(response(y, m, 5)));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('label[for="year-select"]')).not.toBeNull();
    expect(el.querySelector('label[for="month-select"]')).not.toBeNull();
  });
});

describe('MonthlyPageComponent Monatsachse (V21)', () => {
  /** Daten für den 1. bis 19. eines Monats, wie im laufenden Monat. */
  function untilDay(year: string, month: string, last: number): MonthResponse {
    return {
      year, month,
      data: Array.from({ length: last }, (_, i) => ({ day: i + 1, avgTemp: 5 + i / 10, totalPrecip: 0.5 })),
    };
  }

  it('laufender Monat (November, Daten bis 19.): 30 Labels, danach null als Lücke', () => {
    const fixture = create((y, m) => of(untilDay(y, m, 19)));
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
    const fixture = create((y, m) => of(untilDay(y, m, 5)));
    select(fixture, '2026', '12');
    expect(fixture.componentInstance.chartData()!.labels).toHaveLength(31);
  });

  it('Tage ohne Daten mitten im Monat sind ebenfalls null', () => {
    const fixture = create((y, m) => of({
      year: y, month: m,
      data: [{ day: 1, avgTemp: 3, totalPrecip: 0 }, { day: 3, avgTemp: 4, totalPrecip: 1 }],
    }));
    select(fixture, '2025', '03');
    const chart = fixture.componentInstance.chartData()!;
    expect(chart.labels).toHaveLength(31);
    expect(chart.temperatures.slice(0, 4)).toEqual([3, null, 4, null]);
  });
});
