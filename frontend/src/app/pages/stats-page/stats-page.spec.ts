import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { RECORDS_EMPTY_MESSAGE, RECORDS_ERROR_MESSAGE, StatsPageComponent } from './stats-page';
import { WeatherService } from '../../services/weather.service';
import { Records } from '../../models/api';
import { routes } from '../../app.routes';

/** Rekorde wie Fixture `us06-records` (Werte ungerundet, Rundung macht die Karte). */
const RECORDS: Records = {
  locationId: 1,
  hottest: { value: 30.04, timeLocal: '2026-07-02T15:00', date: '2026-07-02', observationId: null, corrected: false },
  coldest: { value: -7.96, timeLocal: '2026-01-14T06:00', date: '2026-01-14', observationId: null, corrected: false },
  wettestDay: { value: 12.3, date: '2026-07-09' },
  longestDryPeriod: { days: 4, from: '2026-07-05', to: '2026-07-08' },
  daysCounted: 11,
  excludesPredictions: true,
};

const NO_RECORDS: Records = {
  locationId: 1, hottest: null, coldest: null, wettestDay: null, longestDryPeriod: null, daysCounted: 0, excludesPredictions: true,
};

function create(getRecords: () => Observable<Records>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: { getRecords } }, provideRouter(routes, withComponentInputBinding())],
  });
  const fixture = TestBed.createComponent(StatsPageComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const card = (cls: string) => el.querySelector(`app-kpi-card.${cls}`) as HTMLElement;
  return { fixture, el, card, c: fixture.componentInstance };
}

describe('StatsPageComponent Rekorde aus /api/records (US06)', () => {
  it('vier Rekordkarten mit Wert, Datum und Stunde bei Temperatur; Trockenperiode mit Zeitraum', () => {
    const { el, card } = create(() => of(RECORDS));
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);

    const hottest = card('record-hottest');
    expect(hottest.querySelector('.kpi-kicker')?.textContent?.trim()).toBe('Heißester Tag');
    expect(hottest.querySelector('.kpi-value')?.textContent).toContain('30,0');
    expect(hottest.querySelector('.kpi-meta')?.textContent).toContain('02.07.2026, 15:00 Uhr');

    const coldest = card('record-coldest');
    expect(coldest.querySelector('.kpi-value')?.textContent).toContain('-8,0');
    expect(coldest.querySelector('.kpi-meta')?.textContent).toContain('14.01.2026, 06:00 Uhr');

    const wettest = card('record-wettest');
    expect(wettest.querySelector('.kpi-value')?.textContent).toContain('12,3');
    expect(wettest.querySelector('.kpi-meta')?.textContent).toContain('09.07.2026');

    const dry = card('record-dry');
    expect(dry.querySelector('.kpi-value')?.textContent).toContain('4');
    expect(dry.querySelector('.kpi-value')?.textContent).toContain('Tage');
    expect(dry.querySelector('.kpi-meta')?.textContent).toContain('05.07.2026 – 08.07.2026');
  });

  it('Datenbasis: Zahl der vollständigen Tage aus daysCounted, ohne Vorhersagestunden', () => {
    const { el } = create(() => of(RECORDS));
    const basis = el.querySelector('app-notice.records-basis') as HTMLElement;
    expect(basis.textContent).toContain('11 vollständige Tage, ohne Vorhersagestunden.');
    expect(el.textContent).not.toContain('Gespeicherte Messtage');
  });

  it('Link „Tag ansehen →“ je Rekord auf /tag/:date; die Karte selbst ist kein Link', () => {
    const { card } = create(() => of(RECORDS));
    const href = (cls: string) => card(cls).querySelector('a')?.getAttribute('href');
    expect(card('record-hottest').querySelector('a')?.textContent).toContain('Tag ansehen');
    expect(href('record-hottest')).toBe('/tag/2026-07-02');
    expect(href('record-coldest')).toBe('/tag/2026-01-14');
    expect(href('record-wettest')).toBe('/tag/2026-07-09');
    expect(href('record-dry')).toBe('/tag/2026-07-05');
    for (const cls of ['record-hottest', 'record-coldest', 'record-wettest', 'record-dry']) {
      expect(card(cls).querySelectorAll('a')).toHaveLength(1);
      expect(card(cls).closest('a')).toBeNull();
    }
  });

  it('ein einzelner Rekord null: Karte zeigt „–“ und „Noch keine Daten“, ohne Link', () => {
    const { card } = create(() => of({ ...RECORDS, wettestDay: null }));
    const wettest = card('record-wettest');
    expect(wettest.querySelector('.kpi-value')?.textContent?.trim()).toBe('–');
    expect(wettest.querySelector('.kpi-meta')?.textContent).toContain('Noch keine Daten');
    expect(wettest.querySelector('a')).toBeNull();
  });

  it('Link „Tag ansehen →“ öffnet die Tagesansicht', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: WeatherService, useValue: { getRecords: () => of(RECORDS), getDay: () => new Subject(), getForecasts: () => new Subject() } },
        provideRouter(routes, withComponentInputBinding()),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/statistiken', StatsPageComponent);
    harness.detectChanges();
    const link = (harness.fixture.nativeElement as HTMLElement).querySelector('app-kpi-card.record-hottest a') as HTMLAnchorElement;
    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/tag/2026-07-02');
  });
});

describe('StatsPageComponent Zustände (B5.2)', () => {
  it('Laden: Skelett mit vier Karten, keine Zahl „0“ (V14)', () => {
    const pending = new Subject<Records>();
    const { el, c } = create(() => pending);
    expect(c.state()).toBe('loading');
    expect(el.querySelector('app-loading')).not.toBeNull();
    expect(el.querySelectorAll('app-loading app-kpi-card')).toHaveLength(4);
    expect(el.querySelector('.kpi-value')).toBeNull();
  });

  it('leer (alle Rekorde null, daysCounted 0, US06-5): Leerzustand statt Karten', () => {
    const { el, c } = create(() => of(NO_RECORDS));
    expect(c.state()).toBe('empty');
    expect(el.querySelector('app-empty')?.textContent).toContain(RECORDS_EMPTY_MESSAGE);
    expect(el.querySelector('app-kpi-card')).toBeNull();
  });

  it('daysCounted 0, aber ein Stundenrekord von heute: Karten werden gezeigt', () => {
    const { el, c } = create(() => of({ ...NO_RECORDS, hottest: RECORDS.hottest }));
    expect(c.state()).toBe('success');
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
  });

  it('Fehler: Fehlerbox mit „Erneut versuchen“, ein Klick lädt neu', () => {
    let calls = 0;
    const { el, fixture, c } = create(() => {
      calls++;
      return calls === 1 ? throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })) : of(RECORDS);
    });
    expect(c.state()).toBe('error');
    const box = el.querySelector('app-error') as HTMLElement;
    expect(box.textContent).toContain(RECORDS_ERROR_MESSAGE);
    expect(box.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('app-kpi-card')).toBeNull();

    (box.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(calls).toBe(2);
    expect(c.state()).toBe('success');
    expect(el.querySelector('app-error')).toBeNull();
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
  });
});

describe('StatsPageComponent gegen die neue API (HttpTestingController)', () => {
  it('genau 1 Request GET /api/records', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    const req = http.expectOne('/api/records');
    expect(req.request.method).toBe('GET');
    req.flush(RECORDS);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-kpi-card')).toHaveLength(4);
    http.verify();
  });
});
