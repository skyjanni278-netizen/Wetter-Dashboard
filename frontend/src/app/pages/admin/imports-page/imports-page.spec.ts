import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IMPORTS_ERROR_MESSAGE, ImportsPageComponent } from './imports-page';
import { IMPORT_RUNNING_MESSAGE } from '../import-feedback/import-feedback';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { TO_BEFORE_FROM_MESSAGE } from '../../../utils/date-range';
import { apiErrorBody, importList, importResource, statusOf } from '../../../testing/admin-fixtures';

@Component({ template: '' })
class Blank {}

const isImports = (r: { url: string; method: string }) => r.url === '/api/imports' && r.method === 'GET';
const isCreate = (r: { url: string; method: string }) => r.url === '/api/imports' && r.method === 'POST';

const ITEMS = [
  importResource({ id: 14, status: 'running' }),
  importResource({ id: 13, status: 'succeeded', kind: 'gaps', counts: { inserted: 12, updated: 3, unchanged: 700, skippedCorrected: 0 } }),
  importResource({ id: 12, status: 'failed' }),
];

async function setup(url = '/admin/importe', options: { flushList?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'admin/importe', component: ImportsPageComponent },
        { path: 'admin/importe/:id', component: Blank },
      ], withComponentInputBinding()),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ImportsPageComponent);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  http.expectOne('/api/status').flush(statusOf({ today: '2026-11-22' }));
  let listReq: TestRequest | null = null;
  if (options.flushList !== false) {
    listReq = http.expectOne(isImports);
    listReq.flush(importList(ITEMS, { total: 3 }));
  }
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;

  function type(id: string, value: string) {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }
  function submit() {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  }
  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  const cells = () => Array.from(el.querySelectorAll('app-data-table tbody tr')).map(tr =>
    Array.from(tr.children).map(c => c.textContent?.replace(/\s+/g, ' ').trim()));

  return { harness, http, router, el, type, submit, settle, cells, listReq };
}

describe('ImportsPageComponent (US10, US11)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('Protokoll', () => {
    it('lädt Seite 1 mit limit=20, zeigt meta.total, Nummer als Link und Status als Chip', async () => {
      const { el, cells, listReq } = await setup();
      expect(listReq!.request.params.get('page')).toBe('1');
      expect(listReq!.request.params.get('limit')).toBe('20');
      expect(listReq!.request.params.has('status')).toBe(false);
      expect(el.querySelector('.imports-total')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('3 Importe');

      const rows = cells();
      expect(rows.length).toBe(3);
      expect(rows[0][0]).toBe('#14');
      expect(rows[1]).toContain('OK');
      expect(rows[1]).toContain('Lücken');
      const link = el.querySelector('app-data-table tbody th a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/admin/importe/14');
      expect(link.getAttribute('aria-label')).toBe('Import #14 ansehen');
      const chips = Array.from(el.querySelectorAll('app-data-table app-chip'));
      expect(chips.map(c => c.textContent?.trim())).toEqual(['Läuft', 'OK', 'Fehler']);
      expect(chips[1].classList).toContain('chip-success');
      expect(chips[2].classList).toContain('chip-danger');
    });

    it('?seite=2: page=2 an die API, Blättern mit „Vorherige“ (ohne seite) und „Nächste“ (seite=3)', async () => {
      const { http, harness, el } = await setup('/admin/importe?seite=2', { flushList: false });
      const req = http.expectOne(isImports);
      expect(req.request.params.get('page')).toBe('2');
      req.flush(importList(ITEMS, { page: 2, total: 45 }));
      harness.detectChanges();
      expect(el.querySelector('.pager-info')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Seite 2 von 3');
      const links = Array.from(el.querySelectorAll('.pager a')) as HTMLAnchorElement[];
      expect(links.map(a => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['‹ Vorherige Seite', 'Nächste Seite ›']);
      expect(links[0].getAttribute('href')).toBe('/admin/importe');
      expect(links[1].getAttribute('href')).toBe('/admin/importe?seite=3');
      expect(el.querySelector('.imports-total')?.textContent).toContain('45');
    });

    it.each(['abc', '0', '-2', '1.5'])('?seite=%s ist ungültig → Seite 1', async seite => {
      const { http } = await setup(`/admin/importe?seite=${seite}`, { flushList: false });
      const req = http.expectOne(isImports);
      expect(req.request.params.get('page')).toBe('1');
      req.flush(importList([]));
    });

    it('Klick auf „Nächste Seite“ navigiert auf ?seite=2 und lädt Seite 2', async () => {
      const { http, harness, el, router, settle } = await setup('/admin/importe', { flushList: false });
      http.expectOne(isImports).flush(importList(ITEMS, { total: 21 }));
      harness.detectChanges();
      (el.querySelector('.pager a') as HTMLAnchorElement).click();
      await settle();
      expect(router.url).toBe('/admin/importe?seite=2');
      const req = http.expectOne(isImports);
      expect(req.request.params.get('page')).toBe('2');
      req.flush(importList([importResource({ id: 1 })], { page: 2, total: 21 }));
    });

    it('nur eine Seite: kein Blättern; Seite hinter dem Ende: leere Tabelle mit Hinweis und „Vorherige“', async () => {
      const first = await setup();
      expect(first.el.querySelector('.pager')).toBeNull();
      TestBed.resetTestingModule();

      const { http, harness, el } = await setup('/admin/importe?seite=9', { flushList: false });
      http.expectOne(isImports).flush(importList([], { page: 9, total: 3 }));
      harness.detectChanges();
      expect(el.querySelector('.cell-empty')?.textContent?.trim()).toBe('Auf dieser Seite gibt es keine Einträge.');
      expect(el.querySelector('.pager a')?.textContent).toContain('Vorherige Seite');
    });

    it('Filter ?status=failed geht an die API; Auswahl im Select navigiert ohne seite (US11-2)', async () => {
      const { http, harness, el, router, settle } = await setup('/admin/importe?status=failed&seite=2', { flushList: false });
      const req = http.expectOne(isImports);
      expect(req.request.params.get('status')).toBe('failed');
      req.flush(importList([importResource({ status: 'failed' })], { page: 2, total: 21 }));
      harness.detectChanges();
      const select = el.querySelector('#imports-status-filter') as HTMLSelectElement;
      expect(select.value).toBe('failed');
      expect(el.querySelector('.imports-total')?.textContent).toContain('mit Status „Fehler“');

      select.value = 'partial';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(router.url).toBe('/admin/importe?status=partial');
      const next = http.expectOne(isImports);
      expect(next.request.params.get('status')).toBe('partial');
      expect(next.request.params.get('page')).toBe('1');
      next.flush(importList([]));
    });

    it('unbekannter Status in der URL → alle Importe', async () => {
      const { http } = await setup('/admin/importe?status=done', { flushList: false });
      const req = http.expectOne(isImports);
      expect(req.request.params.has('status')).toBe(false);
      req.flush(importList([]));
    });

    it('Laden: Skelett; Fehler: Fehlerbox mit Meldung der API und „Erneut versuchen“', async () => {
      const { http, harness, el } = await setup('/admin/importe', { flushList: false });
      expect(el.querySelector('.imports-log app-loading')).not.toBeNull();
      http.expectOne(isImports).flush(null, { status: 502, statusText: 'Bad Gateway' });
      harness.detectChanges();
      const error = el.querySelector('.imports-log app-error')!;
      expect(error.textContent).toContain(IMPORTS_ERROR_MESSAGE);
      expect(error.textContent).toContain('Server nicht erreichbar.');
      expect(el.querySelector('app-data-table')).toBeNull();

      (error.querySelector('button') as HTMLButtonElement).click();
      harness.detectChanges();
      http.expectOne(isImports).flush(importList(ITEMS));
      harness.detectChanges();
      expect(el.querySelector('.imports-log app-error')).toBeNull();
      expect(el.querySelectorAll('app-data-table tbody tr').length).toBe(3);
    });

    it('leeres Protokoll: „Noch keine Importe.“', async () => {
      const { http, harness, el } = await setup('/admin/importe', { flushList: false });
      http.expectOne(isImports).flush(importList([]));
      harness.detectChanges();
      expect(el.querySelector('.cell-empty')?.textContent?.trim()).toBe('Noch keine Importe.');
      expect(el.querySelector('.imports-total')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('0 Importe');
    });
  });

  describe('Formular „Import starten“', () => {
    it('sichtbare Labels Von, Bis, Art; max = heute laut Server', async () => {
      const { el } = await setup();
      const labels = Array.from(el.querySelectorAll('.import-form-card label')).map(l => l.textContent?.trim());
      expect(labels).toEqual(['Von', 'Bis', 'Art']);
      expect((el.querySelector('#import-to') as HTMLInputElement).getAttribute('max')).toBe('2026-11-22');
      const options = Array.from((el.querySelector('#import-kind') as HTMLSelectElement).options).map(o => o.value);
      expect(options).toEqual(['range', 'gaps']);
    });

    it('Bis vor Von: Fehler am Feld „Bis“ mit aria-invalid und aria-describedby, kein Request (US10-4)', async () => {
      const { el, http, type, submit, settle } = await setup();
      type('import-from', '2026-10-31');
      type('import-to', '2026-10-01');
      submit();
      await settle();
      http.expectNone(isCreate);
      const to = el.querySelector('#import-to') as HTMLInputElement;
      expect(el.querySelector('#import-to-error')?.textContent).toContain(TO_BEFORE_FROM_MESSAGE);
      expect(to.getAttribute('aria-invalid')).toBe('true');
      expect(to.getAttribute('aria-describedby')).toContain('import-to-error');
      expect(el.querySelector('#import-from')?.getAttribute('aria-invalid')).toBeNull();

      // Korrektur entfernt die Meldung sofort
      type('import-to', '2026-11-01');
      await settle();
      expect(el.querySelector('#import-to-error')).toBeNull();
      expect(to.getAttribute('aria-invalid')).toBeNull();
    });

    it('leere Felder: Pflichtmeldungen an beiden Feldern, kein Request', async () => {
      const { el, http, submit, settle } = await setup();
      submit();
      await settle();
      http.expectNone(isCreate);
      expect(el.querySelector('#import-from-error')).not.toBeNull();
      expect(el.querySelector('#import-to-error')).not.toBeNull();
    });

    it('Erfolg (202): POST mit kind/from/to, Box „ERFOLG – Import #43 gestartet.“ mit Link, Protokoll lädt neu', async () => {
      const { el, http, harness, type, submit } = await setup();
      type('import-from', '2026-10-01');
      type('import-to', '2026-10-31');
      const select = el.querySelector('#import-kind') as HTMLSelectElement;
      select.value = 'gaps';
      select.dispatchEvent(new Event('change'));
      submit();

      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.textContent?.trim()).toBe('Wird gestartet …');
      submit(); // zweites Absenden während des Sendens: ignoriert

      const req = http.expectOne(isCreate);
      expect(req.request.body).toEqual({ kind: 'gaps', from: '2026-10-01', to: '2026-10-31' });
      req.flush(importResource({ id: 43, kind: 'gaps' }), { status: 202, statusText: 'Accepted' });
      harness.detectChanges();

      const box = el.querySelector('app-notice.notice-success') as HTMLElement;
      expect(box.getAttribute('role')).toBe('status');
      expect(box.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Erfolg');
      expect(box.textContent).toContain('Import #43 gestartet.');
      expect(box.querySelector('a')?.getAttribute('href')).toBe('/admin/importe/43');
      expect(button.getAttribute('aria-busy')).toBeNull();
      http.expectOne(isImports).flush(importList([importResource({ id: 43 }), ...ITEMS]));
    });

    it('400 mit errors[].field = "to" (DATE_IN_FUTURE): Meldung am Feld „Bis“, keine Box', async () => {
      const { el, http, harness, type, submit, settle } = await setup();
      type('import-from', '2026-11-01');
      type('import-to', '2026-11-20');
      submit();
      http.expectOne(isCreate).flush(
        apiErrorBody(400, 'DATE_IN_FUTURE', 'Das Datum liegt in der Zukunft.', [
          { field: 'to', code: 'date_in_future', message: 'Das Enddatum liegt nach heute.' },
        ]),
        { status: 400, statusText: 'Bad Request' },
      );
      harness.detectChanges();
      await settle();
      expect(el.querySelector('#import-to-error')?.textContent).toContain('Das Enddatum liegt nach heute.');
      expect(el.querySelector('#import-to')?.getAttribute('aria-invalid')).toBe('true');
      expect(el.querySelector('app-import-feedback')).toBeNull();
    });

    it('400 ohne passendes Feld (unrecognized_keys): Meldung oben in der Fehlerbox', async () => {
      const { el, http, harness, type, submit } = await setup();
      type('import-from', '2026-11-01');
      type('import-to', '2026-11-02');
      submit();
      http.expectOne(isCreate).flush(
        apiErrorBody(400, 'VALIDATION_FAILED', 'Die Anfrage enthält ungültige Werte.', [
          { field: 'x', code: 'unrecognized_keys', message: 'Das Feld „x“ ist nicht erlaubt.' },
        ]),
        { status: 400, statusText: 'Bad Request' },
      );
      harness.detectChanges();
      const box = el.querySelector('app-import-feedback app-notice') as HTMLElement;
      expect(box.getAttribute('role')).toBe('alert');
      expect(box.textContent).toContain('Das Feld „x“ ist nicht erlaubt.');
    });

    it('409 IMPORT_RUNNING: verständliche Meldung mit Link auf den laufenden Import (US10-7)', async () => {
      const { el, http, harness, type, submit } = await setup();
      type('import-from', '2026-10-01');
      type('import-to', '2026-10-31');
      submit();
      http.expectOne(isCreate).flush(
        apiErrorBody(409, 'IMPORT_RUNNING', 'Es läuft bereits ein Import (42).', [], { runningImportId: 42 }),
        { status: 409, statusText: 'Conflict' },
      );
      harness.detectChanges();
      const box = el.querySelector('app-import-feedback app-notice') as HTMLElement;
      expect(box.getAttribute('role')).toBe('alert');
      expect(box.textContent).toContain(IMPORT_RUNNING_MESSAGE);
      const link = box.querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/admin/importe/42');
      expect(link.textContent).toContain('Laufenden Import #42 ansehen');
    });

    it('Server nicht erreichbar: Fehlerbox „Server nicht erreichbar.“', async () => {
      const { el, http, harness, type, submit } = await setup();
      type('import-from', '2026-10-01');
      type('import-to', '2026-10-31');
      submit();
      http.expectOne(isCreate).flush(null, { status: 504, statusText: 'Gateway Timeout' });
      harness.detectChanges();
      expect(el.querySelector('app-import-feedback')?.textContent).toContain('Server nicht erreichbar.');
    });
  });
});
