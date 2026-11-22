import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { IMPORT_ERROR_MESSAGE, INVALID_IMPORT_ID_MESSAGE, ImportDetailPageComponent } from './import-detail-page';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { IMPORT_POLL_INTERVAL_MS } from '../../../utils/admin-format';
import { apiErrorBody, importResource } from '../../../testing/admin-fixtures';

function setup(id: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(ImportDetailPageComponent);
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const chip = () => el.querySelector('.detail-status app-chip')?.textContent?.trim() ?? null;
  function respond(body: object) {
    http.expectOne(`/api/imports/${id}`).flush(body);
    fixture.detectChanges();
  }
  return { fixture, el, http, chip, respond };
}

describe('ImportDetailPageComponent (US11-1, Polling B3.5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('pollt alle 2 s, solange queued/running; Chip „Läuft“ → „OK“, danach kein Request mehr', () => {
    const { el, http, chip, respond } = setup('12');
    expect(el.querySelector('app-loading')).not.toBeNull();
    respond(importResource({ status: 'queued' }));
    expect(chip()).toBe('Wartet');
    expect(el.querySelector('.detail-polling')?.textContent).toContain('alle 2 Sekunden');

    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS - 1);
    http.expectNone('/api/imports/12');
    vi.advanceTimersByTime(1);
    respond(importResource({ status: 'running', startedAt: '2026-11-22T13:05:01Z' }));
    expect(chip()).toBe('Läuft');
    expect(el.querySelector('.detail-status')?.getAttribute('aria-live')).toBe('polite');

    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS);
    respond(importResource({
      status: 'succeeded', startedAt: '2026-11-22T13:05:01Z', finishedAt: '2026-11-22T13:05:04Z',
      counts: { inserted: 700, updated: 44, unchanged: 0, skippedCorrected: 0 },
    }));
    expect(chip()).toBe('OK');
    expect(el.querySelector('.detail-status app-chip')?.classList).toContain('chip-success');
    expect(el.querySelector('.detail-polling')).toBeNull();

    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS * 5);
    http.expectNone('/api/imports/12');
  });

  it('zeigt Auftrag, Zähler, Warnungen und Fehler', () => {
    const { el, respond } = setup('12');
    respond(importResource({
      status: 'failed', kind: 'gaps', finishedAt: '2026-11-22T13:06:00Z',
      counts: { inserted: 5, updated: 1, unchanged: 2, skippedCorrected: 0 },
      warnings: [{ code: 'HOUR_MISSING', message: 'Stunde fehlt bei Open-Meteo.', timeUtc: '2026-11-12T03:00:00Z' }],
      error: { code: 'UPSTREAM_TIMEOUT', message: 'Open-Meteo hat nicht rechtzeitig geantwortet.' },
    }));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Import #12');
    expect(text).toContain('Lücken');
    expect(text).toContain('01.10.2026 – 31.10.2026');
    expect(text).toContain('22.11.2026, 14:05'); // requestedAt in Berliner Zeit
    const kpis = Array.from(el.querySelectorAll('app-kpi-card')).map(k => k.textContent?.replace(/\s+/g, ' ').trim());
    expect(kpis[0]).toContain('Neu');
    expect(kpis[0]).toContain('5');
    expect(text).toContain('HOUR_MISSING: Stunde fehlt bei Open-Meteo. (12.11.2026, 04:00 Uhr)');
    expect(el.querySelector('.detail-error')?.textContent).toContain('UPSTREAM_TIMEOUT: Open-Meteo hat nicht rechtzeitig geantwortet.');
    expect(el.querySelector('.detail-status app-chip')?.textContent?.trim()).toBe('Fehler');
  });

  it('ohne Warnungen: „Keine Warnungen.“; kein Fehlerkasten', () => {
    const { el, respond } = setup('12');
    respond(importResource({ status: 'succeeded' }));
    expect(el.querySelector('.detail-none')?.textContent).toBe('Keine Warnungen.');
    expect(el.querySelector('.detail-error')).toBeNull();
  });

  it('Polling stoppt beim Verlassen der Seite', () => {
    const { fixture, http, respond } = setup('12');
    respond(importResource({ status: 'running' }));
    fixture.destroy();
    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS * 5);
    http.expectNone('/api/imports/12');
  });

  it.each([
    [429, 'TOO_MANY_REQUESTS', 'Zu viele Anfragen.'],
    [401, 'UNAUTHENTICATED', 'Das Token ist ungültig oder abgelaufen. Bitte neu anmelden.'],
    [500, 'INTERNAL_ERROR', 'Interner Fehler'],
  ])('Polling stoppt bei %i (kein Dauerfeuer); Fehlerbox, „Erneut versuchen“ startet neu', (status, code, message) => {
    const { fixture, el, http, chip, respond } = setup('12');
    respond(importResource({ status: 'running' }));
    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS);
    http.expectOne('/api/imports/12').flush(apiErrorBody(status, code, message), { status, statusText: 'Error' });
    fixture.detectChanges();
    const error = el.querySelector('app-error')!;
    expect(error.textContent).toContain(IMPORT_ERROR_MESSAGE);
    expect(error.textContent).toContain(message);
    expect(chip()).toBeNull(); // alte Werte entfallen (B5.2)

    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS * 10);
    http.expectNone('/api/imports/12');

    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    respond(importResource({ status: 'succeeded' }));
    expect(chip()).toBe('OK');
  });

  it('404: Leerzustand „Import #999 gibt es nicht.“ mit Link zum Protokoll, kein Polling', () => {
    const { fixture, el, http } = setup('999');
    http.expectOne('/api/imports/999').flush(apiErrorBody(404, 'NOT_FOUND', 'Nicht gefunden.'), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el.querySelector('app-empty')?.textContent).toContain('Import #999 gibt es nicht.');
    expect(el.querySelector('app-empty a')?.getAttribute('href')).toBe('/admin/importe');
    expect(el.querySelector('app-error')).toBeNull();
    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS * 3);
    http.expectNone('/api/imports/999');
  });

  it.each(['abc', '0', '-1', '1.5'])('ungültige Nummer %j: Hinweis ohne Request', id => {
    const { el, http } = setup(id);
    http.expectNone(() => true);
    expect(el.querySelector('app-empty')?.textContent).toContain(INVALID_IMPORT_ID_MESSAGE);
  });

  it('Wechsel der Nummer bricht das alte Polling ab', () => {
    const { fixture, http, respond } = setup('12');
    respond(importResource({ status: 'running' }));
    fixture.componentRef.setInput('id', '13');
    fixture.detectChanges();
    http.expectOne('/api/imports/13').flush(importResource({ id: 13, status: 'succeeded' }));
    vi.advanceTimersByTime(IMPORT_POLL_INTERVAL_MS * 3);
    http.expectNone('/api/imports/12');
    http.expectNone('/api/imports/13');
  });
});
