import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WeatherService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const calls: [string, () => unknown, string][] = [
    ['getStatus', () => service.getStatus(), '/api/status'],
    ['getLocation', () => service.getLocation(1), '/api/locations/1'],
    ['getToday', () => service.getToday(), '/api/days/today'],
    ['getDay', () => service.getDay('2026-11-10'), '/api/days/2026-11-10'],
    ['getForecasts', () => service.getForecasts(), '/api/forecasts'],
    ['getRecords', () => service.getRecords(), '/api/records'],
    ['getDays', () => service.getDays('2026-11-01', '2026-11-19'), '/api/days?from=2026-11-01&to=2026-11-19'],
    ['getMonthSummary', () => service.getMonthSummary('2026-11'), '/api/summaries/months/2026-11'],
    ['getMonthSummaries', () => service.getMonthSummaries('2025'), '/api/summaries/months?year=2025'],
    ['getYearSummary', () => service.getYearSummary('2026'), '/api/summaries/years/2026'],
    ['getYearList', () => service.getYearList(), '/api/summaries/years'],
    ['getPeriod', () => service.getPeriod('2025-11-01', '2025-11-18'), '/api/summaries/periods?from=2025-11-01&to=2025-11-18'],
  ];

  it('keine Express-Pfade mehr für Tag, Vorschau und Rekorde (Schritt 7)', () => {
    const methods = Object.getOwnPropertyNames(WeatherService.prototype);
    expect(methods).not.toContain('getForecast');
    expect(methods).not.toContain('getStats');
  });

  it('keine Express-Pfade mehr für Monat und Jahr (Schritt 8)', () => {
    const methods = Object.getOwnPropertyNames(WeatherService.prototype);
    expect(methods).not.toContain('getMonth');
    expect(methods).not.toContain('getYear');
  });

  it('getDays liefert items und meta unverändert; Zeitraum ohne Daten bleibt eine leere Liste', () => {
    let result: unknown;
    service.getDays('2024-12-01', '2024-12-31').subscribe(d => (result = d));
    const req = http.expectOne('/api/days?from=2024-12-01&to=2024-12-31');
    expect(req.request.params.get('from')).toBe('2024-12-01');
    expect(req.request.params.get('to')).toBe('2024-12-31');
    req.flush({ items: [], meta: { from: '2024-12-01', to: '2024-12-31', count: 0 } });
    expect(result).toEqual({ items: [], meta: { from: '2024-12-01', to: '2024-12-31', count: 0 } });
  });

  it('getMonthSummary gibt 404 NO_DATA an den Aufrufer weiter', () => {
    let status = 0;
    service.getMonthSummary('2024-12').subscribe({ error: (e: { status: number }) => (status = e.status) });
    http.expectOne('/api/summaries/months/2024-12').flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'x', errors: [], details: { dataFrom: '2025-01-01' } },
      { status: 404, statusText: 'Not Found' },
    );
    expect(status).toBe(404);
  });

  it('getPeriod gibt 404 NO_DATA an den Aufrufer weiter (Vorjahr ohne Daten, R29)', () => {
    let status = 0;
    service.getPeriod('2024-01-01', '2024-11-18').subscribe({ error: (e: { status: number }) => (status = e.status) });
    const req = http.expectOne('/api/summaries/periods?from=2024-01-01&to=2024-11-18');
    expect(req.request.params.keys()).toEqual(['from', 'to']);
    req.flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'x', errors: [], details: { dataFrom: '2025-01-01' } },
      { status: 404, statusText: 'Not Found' },
    );
    expect(status).toBe(404);
  });

  it('getToday liefert den Tag der neuen API unverändert (current, observed, predicted, isPrediction)', () => {
    const day = {
      id: '2026-11-19', date: '2026-11-19', locationId: 1, timezone: 'Europe/Berlin', isToday: true,
      hoursExpected: 24, hoursObserved: 15, hoursPredicted: 9, complete: false,
      current: { observationId: null, timeLocal: '2026-11-19T14:00' },
      observed: {
        temperature: { mean: 9, min: 8.4, max: 9.8, minAt: '2026-11-19T06:00', maxAt: '2026-11-19T13:00' },
        precipitationSum: 0.4, isDryDay: null,
      },
      predicted: { temperature: { min: 8.1, max: 9.4 }, precipitationSum: 5.4 },
      hours: [{
        timeLocal: '2026-11-19T14:00', temperature: 9.6, apparentTemperature: 5.1, precipitation: 0.4, weatherCode: 61,
        windSpeed: 21.3, windDirection: 232, source: 'forecast_api', isPrediction: false, correctedAt: null,
      }],
    };
    let result: unknown;
    service.getToday().subscribe(d => (result = d));
    http.expectOne('/api/days/today').flush(day);
    expect(result).toEqual(day);
  });

  it('getDay gibt 404 NO_DATA mit Body nach B3.3 an den Aufrufer weiter', () => {
    let error: { status?: number; error?: { code?: string } } = {};
    service.getDay('2024-12-31').subscribe({ error: e => (error = e) });
    http.expectOne('/api/days/2024-12-31').flush(
      { statusCode: 404, error: 'Not Found', code: 'NO_DATA', message: 'x', errors: [], details: { dataFrom: '2025-01-01' } },
      { status: 404, statusText: 'Not Found' },
    );
    expect(error.status).toBe(404);
    expect(error.error?.code).toBe('NO_DATA');
  });

  it('getForecasts liefert items und fetchedAt; leere Vorschau bleibt eine leere Liste', () => {
    let result: unknown;
    service.getForecasts().subscribe(f => (result = f));
    http.expectOne('/api/forecasts').flush({ items: [], fetchedAt: null });
    expect(result).toEqual({ items: [], fetchedAt: null });
  });

  it('getRecords liefert Rekorde ohne Daten mit null und daysCounted 0', () => {
    const records = {
      locationId: 1, hottest: null, coldest: null, wettestDay: null, longestDryPeriod: null,
      daysCounted: 0, excludesPredictions: true,
    };
    let result: unknown;
    service.getRecords().subscribe(r => (result = r));
    const req = http.expectOne('/api/records');
    expect(req.request.method).toBe('GET');
    req.flush(records);
    expect(result).toEqual(records);
  });

  for (const [name, call, url] of calls) {
    it(`${name} ruft GET ${url} auf`, () => {
      (call() as { subscribe: () => void }).subscribe();
      const req = http.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  }

  it('getStatus liefert den Datenstand der neuen API unverändert (null bleibt null)', () => {
    const status = {
      locationId: 1, today: '2026-11-20', timezone: 'Europe/Berlin', dataFrom: '2025-01-01', dataTo: '2026-11-20',
      lastSuccessfulUpdateAt: null, updateState: 'never' as const,
    };
    let result: unknown;
    service.getStatus().subscribe(s => (result = s));
    http.expectOne('/api/status').flush(status);
    expect(result).toEqual(status);
  });

  it('getLocation(99) gibt den 404-Fehler an den Aufrufer weiter', () => {
    let status = 0;
    service.getLocation(99).subscribe({ error: (e: { status: number }) => (status = e.status) });
    http.expectOne('/api/locations/99').flush({ statusCode: 404 }, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });
});
