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
});
