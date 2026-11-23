import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataStatusService } from './data-status.service';
import { berlinToday } from '../utils/berlin-date';
import { statusOf } from '../testing/admin-fixtures';
import type { Status } from '../models/api';

describe('DataStatusService (N01, 03 B4.8: heute laut Server)', () => {
  let service: DataStatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DataStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ohne load(): idle, kein Request, heute = Browser-Uhr, niemand wartet', () => {
    expect(service.state()).toBe('idle');
    expect(service.today()).toBe(berlinToday());
    expect(service.waiting()).toBe(false);
    http.expectNone('/api/status');
  });

  it('load(): ein Request; bis zur Antwort wartet die App, danach gilt status.today (FAKE_NOW)', () => {
    service.load();
    service.load(); // zweiter Aufruf während des Requests: kein zweiter Request
    expect(service.waiting()).toBe(true);
    expect(service.today()).toBe(berlinToday());
    http.expectOne('/api/status').flush(statusOf({ today: '2026-11-19' }));
    expect(service.state()).toBe('success');
    expect(service.waiting()).toBe(false);
    expect(service.today()).toBe('2026-11-19');
    service.load(); // schon geladen: kein Request
    http.expectNone('/api/status');
  });

  it('Fehler: state = error, niemand wartet mehr, heute = Browser-Uhr; results$ meldet null', () => {
    const results: (Status | null)[] = [];
    service.results$.subscribe(r => results.push(r));
    service.load();
    http.expectOne('/api/status').flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(service.state()).toBe('error');
    expect(service.waiting()).toBe(false);
    expect(service.today()).toBe(berlinToday());
    expect(results).toEqual([null]);
  });

  it('refresh(): lädt neu, der alte Stand bleibt bis zur Antwort stehen', () => {
    service.load();
    http.expectOne('/api/status').flush(statusOf({ today: '2026-11-19', updateState: 'ok' }));
    service.refresh();
    expect(service.state()).toBe('loading');
    expect(service.waiting()).toBe(false); // es gibt schon einen Stand
    expect(service.status()?.updateState).toBe('ok');
    http.expectOne('/api/status').flush(statusOf({ today: '2026-11-19', updateState: 'delayed' }));
    expect(service.status()?.updateState).toBe('delayed');
  });
});
