import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { YearlyPageComponent } from './yearly-page';
import { WeatherService } from '../../services/weather.service';
import { YearResponse } from '../../models/weather';
import { berlinToday } from '../../utils/berlin-date';
import { routes } from '../../app.routes';
import { AppTitleStrategy } from '../../utils/page-title';

function response(year: string, avgTemp: number): YearResponse {
  return { year, data: [{ month: 1, avgTemp, totalPrecip: 10 }, { month: 2, avgTemp: avgTemp + 1, totalPrecip: 20 }] };
}

/** Komponente ohne Router-Navigation; der Route-Parameter wird als Input gesetzt. */
function create(getYear: (year: string) => Observable<YearResponse>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: { getYear } }, provideRouter([])],
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

/** App-Routen mit withComponentInputBinding(), Navigation wie im Browser. */
async function routed(getYear: (year: string) => Observable<YearResponse>, url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WeatherService, useValue: { getYear } },
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, YearlyPageComponent);
  harness.detectChanges();
  const el = harness.fixture.nativeElement as HTMLElement;
  return {
    harness, el,
    router: TestBed.inject(Router),
    select: () => el.querySelector('select') as HTMLSelectElement,
    title: () => TestBed.inject(Title).getTitle(),
    settle: async () => { await harness.fixture.whenStable(); harness.detectChanges(); },
  };
}

describe('YearlyPageComponent', () => {
  it('Vorbelegung ist das aktuelle Berliner Jahr, die Auswahl zeigt es an (V01)', () => {
    const fixture = create(y => of(response(y, 5)));
    const year = berlinToday().slice(0, 4);
    expect(fixture.componentInstance.selectedYear()).toBe(year);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')!.value).toBe(year);
  });

  it('Jahresliste reicht von 2025 bis zum aktuellen Berliner Jahr, kein Button „Laden“ (V15, V18)', () => {
    const fixture = create(y => of(response(y, 5)));
    const current = parseInt(berlinToday().slice(0, 4), 10);
    expect(fixture.componentInstance.years).toEqual(Array.from({ length: current - 2025 + 1 }, (_, i) => String(current - i)));
    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('/jahr/2025 direkt: 2025 wird angezeigt, Auswahl navigiert über den Router, genau 1 Request je Wechsel (V08, F11)', async () => {
    const calls: string[] = [];
    const t = await routed(y => { calls.push(y); return of(response(y, 5)); }, '/jahr/2025');
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
    const t = await routed(y => { calls.push(y); return of(response(y, 5)); }, url);
    expect(calls).toEqual([]);
    expect(t.router.url).toBe(url);
    const hint = t.el.querySelector('.error') as HTMLElement;
    expect(hint.textContent).toContain('Ungültiges Jahr');
    expect(hint.querySelector('a')?.getAttribute('href')).toBe('/jahr');
    expect(t.title()).toBe('Ungültiges Jahr – Wetter Heubach');
    expect(t.select().selectedOptions[0].textContent?.trim()).toBe('–');
  });

  it('Platzhalter verschwindet nach Wahl eines gültigen Jahres', async () => {
    const calls: string[] = [];
    const t = await routed(y => { calls.push(y); return of(response(y, 5)); }, '/jahr/1999');
    t.select().value = '2025';
    t.select().dispatchEvent(new Event('change'));
    await t.settle();
    expect(t.router.url).toBe('/jahr/2025');
    expect(calls).toEqual(['2025']);
    expect(t.select().value).toBe('2025');
    expect(Array.from(t.select().options).some(o => o.textContent?.trim() === '–')).toBe(false);
  });

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create(y => y === '2025' ? throwError(() => ({ status: 500 })) : of(response(y, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.yearData()?.length).toBe(2);

    select(fixture, '2025');
    expect(c.state()).toBe('error');
    expect(c.yearData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.maxTemp()).toBeNull();
    expect(c.error()).toBe('Fehler beim Laden der Jahresdaten.');
    expect((fixture.nativeElement as HTMLElement).querySelector('.summary-row')).toBeNull();
  });

  it('leere Antwort ergibt empty und Daten null', () => {
    const fixture = create(y => y === '2025' ? of({ year: y, data: [] }) : of(response(y, 5)));
    const c = fixture.componentInstance;
    select(fixture, '2025');
    expect(c.state()).toBe('empty');
    expect(c.yearData()).toBeNull();
    expect(c.error()).toBe('Keine gespeicherten Daten für dieses Jahr.');
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<YearResponse>>();
    const fixture = create(y => {
      const s = new Subject<YearResponse>();
      requests.set(y, s);
      return s;
    });
    const c = fixture.componentInstance;
    const current = berlinToday().slice(0, 4);

    select(fixture, '2025');
    select(fixture, current);

    requests.get(current)!.next(response(current, 4));
    requests.get('2025')!.next(response('2025', 9));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.yearData()?.[0].avgTemp).toBe(4);
    expect(requests.get('2025')!.observed).toBe(false);
  });
});
