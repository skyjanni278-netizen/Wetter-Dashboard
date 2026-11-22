import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { GAPS_ERROR_MESSAGE, GAP_COLUMNS, GAP_COLUMNS_NARROW, GapsPageComponent, TODAY_ERROR_MESSAGE, gapRow } from './gaps-page';
import { IMPORT_RUNNING_MESSAGE } from '../import-feedback/import-feedback';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { TO_BEFORE_FROM_MESSAGE } from '../../../utils/date-range';
import { apiErrorBody, gap, importResource, statusOf } from '../../../testing/admin-fixtures';

const GAPS = [
  gap(),
  gap({ id: '2026-11-18T23:00:00Z', from: '2026-11-19T00:00:00+01:00', to: '2026-11-19T00:00:00+01:00', hours: 1, reason: 'null_values' }),
  gap({ id: '2026-11-21T17:00:00Z', from: '2026-11-21T18:00:00+01:00', to: '2026-11-21T22:00:00+01:00', hours: 5, reason: 'stale_prediction' }),
];

const isGaps = (r: { url: string }) => r.url === '/api/gaps';
const isCreate = (r: { url: string; method: string }) => r.url === '/api/imports' && r.method === 'POST';

describe('Lücken-Tabelle (E3.7.5)', () => {
  it('Spalten: Von, Bis, Stunden, Grund; schmal drei Spalten mit Zeitraum in einer umbrechenden Zelle', () => {
    expect(GAP_COLUMNS.map(c => c.label)).toEqual(['Von', 'Bis', 'Stunden', 'Grund']);
    expect(GAP_COLUMNS_NARROW.map(c => c.label)).toEqual(['Zeitraum', 'Std.', 'Grund']);
    expect(GAP_COLUMNS_NARROW[0].rowHeader).toBeFalsy(); // th bricht nicht um
    expect(gapRow(GAPS[0])['range']).toBe('12.11.2026, 04:00 bis 12.11.2026, 09:00');
    expect(gapRow(GAPS[1])['range']).toBe('19.11.2026, 00:00');
  });
});

function setup(today = '2026-11-22') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(GapsPageComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);

  function flushStatus() {
    http.expectOne('/api/status').flush(statusOf({ today }));
    fixture.detectChanges();
  }
  function type(id: string, value: string) {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  function submit() {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }
  async function settle() {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, el, http, flushStatus, type, submit, settle };
}

describe('GapsPageComponent (US12)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Standard: letzte 7 Tage bis heute laut /api/status (nicht die Uhr des Browsers), lädt sofort', () => {
    const { el, http, fixture, flushStatus } = setup('2026-11-22');
    http.expectNone(isGaps); // ohne Server-Heute keine Abfrage
    flushStatus();
    expect((el.querySelector('#gaps-from') as HTMLInputElement).value).toBe('2026-11-16');
    expect((el.querySelector('#gaps-to') as HTMLInputElement).value).toBe('2026-11-22');
    expect((el.querySelector('#gaps-to') as HTMLInputElement).getAttribute('max')).toBe('2026-11-22');
    const req = http.expectOne(isGaps);
    expect(req.request.params.get('from')).toBe('2026-11-16');
    expect(req.request.params.get('to')).toBe('2026-11-22');
    expect(el.querySelector('.gaps-result app-loading')).not.toBeNull();
    req.flush({ items: GAPS });
    fixture.detectChanges();

    expect(el.querySelector('.gaps-total')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('3 Lücken mit zusammen 12 Stunden im Zeitraum 16.11.2026 – 22.11.2026.');
    const rows = Array.from(el.querySelectorAll('app-data-table tbody tr')).map(tr =>
      Array.from(tr.children).map(c => c.textContent?.trim()));
    expect(rows[0]).toEqual(['12.11.2026, 04:00', '12.11.2026, 09:00', '6', 'Stunde fehlt']);
    expect(rows[1][3]).toBe('Werte leer');
    expect(rows[2][3]).toBe('Veraltete Vorhersage');
  });

  it('keine Lücken: Leerzustand, kein „Nachladen“', () => {
    const { el, http, fixture, flushStatus } = setup();
    flushStatus();
    http.expectOne(isGaps).flush({ items: [] });
    fixture.detectChanges();
    expect(el.querySelector('app-empty')?.textContent).toContain('Im Zeitraum 16.11.2026 – 22.11.2026 fehlt keine abgeschlossene Stunde.');
    expect(el.querySelector('.gaps-reload')).toBeNull();
  });

  it('„Nachladen“: POST /api/imports mit kind "gaps" für den angezeigten Zeitraum, Erfolgsbox mit Link (US12-3)', () => {
    const { el, http, fixture, flushStatus, type } = setup();
    flushStatus();
    http.expectOne(isGaps).flush({ items: GAPS });
    fixture.detectChanges();
    type('gaps-from', '2026-11-01'); // Eingabe ohne Absenden ändert den Nachlade-Zeitraum nicht

    const button = el.querySelector('.gaps-reload') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Nachladen');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent?.trim()).toBe('Wird gestartet …');
    button.click(); // während des Sendens ignoriert

    const req = http.expectOne(isCreate);
    expect(req.request.body).toEqual({ kind: 'gaps', from: '2026-11-16', to: '2026-11-22' });
    req.flush(importResource({ id: 44, kind: 'gaps', from: '2026-11-16', to: '2026-11-22' }), { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    const box = el.querySelector('app-notice.notice-success') as HTMLElement;
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toContain('Import #44 gestartet.');
    expect(box.querySelector('a')?.getAttribute('href')).toBe('/admin/importe/44');
  });

  it('„Nachladen“ während eines Imports: 409 mit Link auf den laufenden Import', () => {
    const { el, http, fixture, flushStatus } = setup();
    flushStatus();
    http.expectOne(isGaps).flush({ items: GAPS });
    fixture.detectChanges();
    (el.querySelector('.gaps-reload') as HTMLButtonElement).click();
    http.expectOne(isCreate).flush(
      apiErrorBody(409, 'IMPORT_RUNNING', 'Es läuft bereits ein Import.', [], { runningImportId: 42 }),
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    const box = el.querySelector('app-import-feedback app-notice') as HTMLElement;
    expect(box.textContent).toContain(IMPORT_RUNNING_MESSAGE);
    expect(box.querySelector('a')?.getAttribute('href')).toBe('/admin/importe/42');
  });

  it('anderer Zeitraum: „Lücken anzeigen“ lädt ihn; Bis vor Von → Fehler am Feld „Bis“ ohne Request', async () => {
    const { el, http, fixture, flushStatus, type, submit, settle } = setup();
    flushStatus();
    http.expectOne(isGaps).flush({ items: GAPS });
    fixture.detectChanges();

    type('gaps-from', '2026-11-19');
    type('gaps-to', '2026-11-01');
    submit();
    await settle();
    http.expectNone(isGaps);
    expect(el.querySelector('#gaps-to-error')?.textContent).toContain(TO_BEFORE_FROM_MESSAGE);
    expect(el.querySelector('#gaps-to')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#gaps-to')?.getAttribute('aria-describedby')).toContain('gaps-to-error');

    type('gaps-from', '2026-11-01');
    type('gaps-to', '2026-11-19');
    submit();
    const req = http.expectOne(isGaps);
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('to')).toBe('2026-11-19');
    req.flush({ items: [] });
    fixture.detectChanges();
    expect(el.querySelector('app-empty')?.textContent).toContain('01.11.2026 – 19.11.2026');
  });

  it('400 mit Feldbezug vom Server: Meldung am Feld, keine Fehlerbox', async () => {
    const { el, http, fixture, flushStatus, settle } = setup();
    flushStatus();
    http.expectOne(isGaps).flush(
      apiErrorBody(400, 'DATE_IN_FUTURE', 'Das Datum liegt in der Zukunft.', [{ field: 'to', code: 'date_in_future', message: 'Das Enddatum liegt nach heute.' }]),
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    await settle();
    expect(el.querySelector('#gaps-to-error')?.textContent).toContain('Das Enddatum liegt nach heute.');
    expect(el.querySelector('.gaps-result app-error')).toBeNull();
  });

  it('Fehler beim Laden der Lücken: Fehlerbox mit „Erneut versuchen“, alte Werte entfallen', () => {
    const { el, http, fixture, flushStatus } = setup();
    flushStatus();
    http.expectOne(isGaps).flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    const error = el.querySelector('.gaps-result app-error')!;
    expect(error.textContent).toContain(GAPS_ERROR_MESSAGE);
    expect(error.textContent).toContain('Server nicht erreichbar.');
    expect(el.querySelector('app-data-table')).toBeNull();
    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(isGaps).flush({ items: GAPS });
    fixture.detectChanges();
    expect(el.querySelectorAll('app-data-table tbody tr').length).toBe(3);
  });

  it('/api/status fällt aus: Fehlerbox, „Erneut versuchen“ lädt den Datenstand und dann die Lücken', () => {
    const { el, http, fixture, flushStatus } = setup();
    http.expectOne('/api/status').flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    const error = el.querySelector('app-error')!;
    expect(error.textContent).toContain(TODAY_ERROR_MESSAGE);
    http.expectNone(isGaps);
    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    flushStatus();
    http.expectOne(isGaps).flush({ items: [] });
  });
});
