import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WeatherService } from './weather.service';

describe('WeatherService (Ist-Verhalten)', () => {
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
    ['getToday', () => service.getToday(), '/api/data/today'],
    ['getDay', () => service.getDay('2026-11-10'), '/api/data/day/2026-11-10'],
    ['getMonth', () => service.getMonth('2026', '11'), '/api/data/month/2026/11'],
    ['getYear', () => service.getYear('2025'), '/api/data/year/2025'],
    ['getForecast', () => service.getForecast(), '/api/forecast'],
    ['getStats', () => service.getStats(), '/api/stats'],
  ];

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
