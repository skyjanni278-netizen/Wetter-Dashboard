import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { STATUS_ERROR_MESSAGE, StatusPageComponent } from './status-page';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { apiErrorBody, gap, importList, importResource, statusOf } from '../../../testing/admin-fixtures';
import type { ImportResource, Status } from '../../../models/api';

const IMPORTS = [
  importResource({ id: 9, status: 'succeeded', kind: 'scheduled', from: '2026-11-22', to: '2026-11-22' }),
  importResource({
    id: 8, status: 'failed', requestedAt: '2026-11-21T12:00:00Z',
    error: { code: 'UPSTREAM_TIMEOUT', message: 'Open-Meteo hat nicht rechtzeitig geantwortet.' },
  }),
];

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(StatusPageComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);

  /** Antwortet auf alle vier Requests (US14-1, -3). */
  function respond(options: { status?: Partial<Status>; healthStatus?: number; imports?: ImportResource[] } = {}) {
    http.expectOne('/api/status').flush(statusOf({ today: '2026-11-22', ...options.status }));
    const imports = http.expectOne(r => r.url === '/api/imports');
    expect(imports.request.params.get('limit')).toBe('10');
    imports.flush(importList(options.imports ?? IMPORTS, { limit: 10 }));
    const gaps = http.expectOne(r => r.url === '/api/gaps');
    expect(gaps.request.params.get('from')).toBe('2026-10-23');
    expect(gaps.request.params.get('to')).toBe('2026-11-22');
    gaps.flush({ items: [gap(), gap({ id: 'b', hours: 2 })] });
    const health = http.expectOne('/api/health');
    if (options.healthStatus && options.healthStatus !== 200) {
      health.flush(
        apiErrorBody(options.healthStatus, 'SERVICE_UNAVAILABLE', 'x', [], options.healthStatus === 503 ? { database: 'error' } : null),
        { status: options.healthStatus, statusText: 'Error' },
      );
    } else {
      health.flush({ status: 'ok', database: 'ok' });
    }
    fixture.detectChanges();
  }
  const card = (cls: string) => el.querySelector(`.${cls}`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return { fixture, el, http, respond, card };
}

describe('StatusPageComponent (US14)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Laden: Skelett; danach /api/status, /api/imports?limit=10, /api/gaps (heute − 30 bis heute laut Server), /api/health', () => {
    const { el, respond, card } = setup();
    expect(el.querySelector('app-loading')).not.toBeNull();
    respond();
    expect(el.querySelector('app-loading')).toBeNull();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Betriebsstatus');

    expect(card('status-update')).toContain('Läuft');
    expect(card('status-update')).toContain('22.11.2026, 13:00'); // lastSuccessfulUpdateAt 12:00Z in Berlin
    expect(card('status-data')).toContain('01.01.2025 – 22.11.2026');
    expect(card('status-gaps')).toContain('2 Lücken mit zusammen 8 Stunden (23.10.2026 – 22.11.2026).');
    expect(el.querySelector('.status-gaps a')?.getAttribute('href')).toBe('/admin/luecken');
    expect(card('status-health')).toContain('OK');
    expect(card('status-health')).toContain('Die Datenbank ist lesbar.');
  });

  it('letzter fehlgeschlagener Import mit Fehlertext und Link; Tabelle der letzten Importe', () => {
    const { el, respond, card } = setup();
    respond();
    expect(card('status-failed')).toContain('Import #8 vom 21.11.2026, 13:00 Uhr');
    expect(card('status-failed')).toContain('UPSTREAM_TIMEOUT: Open-Meteo hat nicht rechtzeitig geantwortet.');
    expect(el.querySelector('.status-failed a')?.getAttribute('href')).toBe('/admin/importe/8');
    expect(el.querySelectorAll('.status-imports tbody tr').length).toBe(2);
    expect(el.querySelector('.status-imports .card-head a')?.getAttribute('href')).toBe('/admin/importe');
  });

  it('Abruf verzögert: Chip „Verzögert“ (danger); nie: „Noch nie“', () => {
    const delayed = setup();
    delayed.respond({ status: { updateState: 'delayed' } });
    expect(delayed.el.querySelector('.status-update app-chip')?.textContent?.trim()).toBe('Verzögert');
    expect(delayed.el.querySelector('.status-update app-chip')?.classList).toContain('chip-danger');
    TestBed.resetTestingModule();

    const never = setup();
    never.respond({ status: { updateState: 'never', lastSuccessfulUpdateAt: null } });
    expect(never.card('status-update')).toContain('Noch nie');
    expect(never.card('status-update')).toContain('–');
  });

  it.each([
    [[], 'Noch keine Importe.'],
    [[importResource({ status: 'succeeded' })], 'Der letzte Import ist nicht fehlgeschlagen.'],
    [[importResource({ id: 2, status: 'succeeded' }), importResource({ id: 1, status: 'partial' })], 'Unter den letzten 2 Importen ist keiner fehlgeschlagen.'],
  ])('ohne fehlgeschlagenen Import: passender Text (%#)', (imports, expected) => {
    const { respond, card } = setup();
    respond({ imports });
    expect(card('status-failed')).toContain(expected);
  });

  it('health 503 (details.database = "error"): Chip „Fehler“, die Seite bleibt sichtbar (US14-3)', () => {
    const { el, respond, card } = setup();
    respond({ healthStatus: 503 });
    expect(card('status-health')).toContain('Fehler');
    expect(card('status-health')).toContain('Die Datenbank ist nicht lesbar.');
    expect(el.querySelector('app-error')).toBeNull();
  });

  it('Leer: ohne gespeicherte Daten ein Hinweis statt des Zeitraums', () => {
    const { el, respond } = setup();
    respond({ status: { dataFrom: null, dataTo: null } });
    expect(el.querySelector('.status-data app-empty')?.textContent).toContain('Es sind noch keine Wetterdaten gespeichert.');
  });

  it('Fehler: Fehlerbox mit Meldung der API, „Erneut versuchen“ lädt alles neu', () => {
    const { fixture, el, http, respond } = setup();
    http.expectOne('/api/status').flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    const error = el.querySelector('app-error')!;
    expect(error.textContent).toContain(STATUS_ERROR_MESSAGE);
    expect(error.textContent).toContain('Server nicht erreichbar.');
    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    respond();
    expect(el.querySelector('app-error')).toBeNull();
    expect(el.querySelector('.status-update')).not.toBeNull();
  });

  it('Fehler bei /api/imports (z. B. 403): Fehlerbox statt Teilwerten', () => {
    const { fixture, el, http } = setup();
    http.expectOne('/api/status').flush(statusOf());
    http.expectOne(r => r.url === '/api/imports').flush(
      apiErrorBody(403, 'FORBIDDEN', 'Für diese Anfrage fehlt die nötige Rolle.'), { status: 403, statusText: 'Forbidden' },
    );
    // forkJoin bricht ab: die übrigen Requests werden abgebrochen
    for (const url of ['/api/gaps', '/api/health']) {
      const pending = http.match(r => r.url === url);
      expect(pending.every(r => r.cancelled)).toBe(true);
    }
    fixture.detectChanges();
    expect(el.querySelector('app-error')?.textContent).toContain('Für diese Anfrage fehlt die nötige Rolle.');
    expect(el.querySelector('.status-update')).toBeNull();
  });
});
