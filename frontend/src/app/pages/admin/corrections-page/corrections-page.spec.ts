import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CorrectionsPageComponent, correctionRow } from './corrections-page';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { TO_BEFORE_FROM_MESSAGE } from '../../../utils/date-range';
import { apiErrorBody, correction, statusOf } from '../../../testing/admin-fixtures';
import type { CorrectionList, CorrectionListItem } from '../../../models/api';

@Component({ template: '' })
class Blank {}

const isList = (r: { url: string }) => r.url === '/api/corrections';

function list(items: CorrectionListItem[], meta: Partial<CorrectionList['meta']> = {}): CorrectionList {
  return { items, meta: { page: 1, limit: 20, total: items.length, ...meta } };
}

const ITEMS = [
  correction({ id: 4, observationId: 16471, observationTimeLocal: '2026-11-18T06:00:00+01:00', oldValue: 1, newValue: -1.5, correctedAt: '2026-11-19T13:22:00Z' }),
  correction(),
];

async function setup(url = '/admin/korrektur') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'admin/korrektur', component: CorrectionsPageComponent },
        { path: 'admin/korrektur/:date', component: Blank },
      ], withComponentInputBinding()),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, CorrectionsPageComponent);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  http.expectOne('/api/status').flush(statusOf({ today: '2026-11-19' }));
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;
  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
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
  return { harness, http, router, el: () => harness.routeNativeElement as HTMLElement, first: el, settle, type, submit };
}

describe('CorrectionsPageComponent /admin/korrektur (US13-14)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('ohne Query: letzte 30 Tage bis heute laut Server; Tabelle mit Link je Zeile auf /admin/korrektur/:date', async () => {
    const { http, harness, el } = await setup();
    const req = http.expectOne(isList);
    expect(req.request.params.get('from')).toBe('2026-10-21');
    expect(req.request.params.get('to')).toBe('2026-11-19');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush(list(ITEMS));
    harness.detectChanges();

    const page = el();
    expect(page.querySelector('h1')?.textContent?.trim()).toBe('Korrekturen');
    expect(page.querySelector('.corrections-total')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('2 Korrekturen im Zeitraum 21.10.2026 – 19.11.2026');
    const links = Array.from(page.querySelectorAll('tbody a')).map(a => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['18.11.2026, 06:00', '/admin/korrektur/2026-11-18'],
      ['19.11.2026, 14:00', '/admin/korrektur/2026-11-19'],
    ]);
    expect(page.querySelector('tbody tr:last-child')?.textContent).toContain('Ausreißer, Nachbarstunden 9,4/9,8 °C');
    expect((page.querySelector('#corrections-from') as HTMLInputElement).value).toBe('2026-10-21');
  });

  it('Filter „Von“/„Bis“ ändert die URL (?von&bis, ohne seite) und lädt den Zeitraum', async () => {
    const { http, router, settle, type, submit } = await setup('/admin/korrektur?seite=2');
    http.expectOne(isList).flush(list([], { page: 2, total: 21 }));
    type('corrections-from', '2026-11-19');
    type('corrections-to', '2026-11-19');
    submit();
    await settle();
    expect(router.url).toBe('/admin/korrektur?von=2026-11-19&bis=2026-11-19');
    const req = http.expectOne(isList);
    expect(req.request.params.get('from')).toBe('2026-11-19');
    expect(req.request.params.get('to')).toBe('2026-11-19');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(list([correction()]));
  });

  it('Blättern über ?seite= (Zeitraum bleibt in der URL)', async () => {
    const { http, harness, router, el, settle } = await setup('/admin/korrektur?von=2026-11-01&bis=2026-11-19');
    const first = http.expectOne(isList);
    expect(first.request.params.get('from')).toBe('2026-11-01');
    first.flush(list(Array.from({ length: 20 }, (_, i) => correction({ id: 100 - i })), { total: 25 }));
    harness.detectChanges();
    expect(el().querySelector('.pager-info')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Seite 1 von 2');
    const next = Array.from(el().querySelectorAll('.pager a')).find(a => a.textContent?.includes('Nächste Seite')) as HTMLAnchorElement;
    next.click();
    await settle();
    expect(router.url).toBe('/admin/korrektur?von=2026-11-01&bis=2026-11-19&seite=2');
    const second = http.expectOne(isList);
    expect(second.request.params.get('page')).toBe('2');
    second.flush(list([correction()], { page: 2, total: 25 }));
  });

  it('Bis vor Von: Meldung am Feld „Bis“ mit aria-invalid, keine Navigation', async () => {
    const { http, router, el, type, submit, settle } = await setup();
    http.expectOne(isList).flush(list([]));
    type('corrections-from', '2026-11-19');
    type('corrections-to', '2026-11-01');
    submit();
    await settle();
    expect(router.url).toBe('/admin/korrektur');
    const to = el().querySelector('#corrections-to') as HTMLInputElement;
    expect(to.getAttribute('aria-invalid')).toBe('true');
    expect(el().querySelector('#corrections-to-error')?.textContent).toContain(TO_BEFORE_FROM_MESSAGE);
    http.expectNone(isList);
  });

  it('ungültiger Zeitraum in der URL: Meldung am Feld, kein Request', async () => {
    const { http, el } = await setup('/admin/korrektur?von=2026-11-19&bis=2026-11-01');
    http.expectNone(isList);
    expect(el().querySelector('#corrections-to-error')?.textContent).toContain(TO_BEFORE_FROM_MESSAGE);
  });

  it('Fehler: Fehlerbox mit „Erneut versuchen“', async () => {
    const { http, harness, el } = await setup();
    http.expectOne(isList).flush(null, { status: 502, statusText: 'Bad Gateway' });
    harness.detectChanges();
    const error = el().querySelector('app-error')!;
    expect(error.textContent).toContain('Die Korrekturen konnten nicht geladen werden.');
    (error.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    http.expectOne(isList).flush(list([]));
    harness.detectChanges();
    expect(el().querySelector('tbody')?.textContent).toContain('Keine Korrekturen in diesem Zeitraum.');
  });

  it('Spanne über 366 Tage in der URL: Meldung am Feld „Bis“, kein Request', async () => {
    const { http, el } = await setup('/admin/korrektur?von=2025-01-01&bis=2026-11-19');
    http.expectNone(isList);
    expect(el().querySelector('#corrections-to-error')?.textContent).toContain('Der Zeitraum darf höchstens 366 Tage umfassen.');
  });

  it('400 vom Server an „to“ steht am Feld, ohne Fehlerbox', async () => {
    const { http, harness, el } = await setup('/admin/korrektur?von=2026-11-01&bis=2026-11-19');
    http.expectOne(isList).flush(
      apiErrorBody(400, 'DATE_IN_FUTURE', 'Das Datum liegt in der Zukunft.', [
        { field: 'to', code: 'DATE_IN_FUTURE', message: 'Das Enddatum darf nicht nach heute liegen.' },
      ]),
      { status: 400, statusText: 'Bad Request' },
    );
    harness.detectChanges();
    expect(el().querySelector('#corrections-to-error')?.textContent).toContain('Das Enddatum darf nicht nach heute liegen.');
    expect(el().querySelector('app-error')).toBeNull();
  });
});

describe('correctionRow (Tabelle E3.7.5)', () => {
  it('Rücknahme als Chip, Änderung mit Grund für die schmale Ansicht', () => {
    const row = correctionRow(correction({ id: 6, oldValue: 9.6, newValue: 19.6, revertsCorrectionId: 3 }));
    expect(row['kind']).toEqual({ chip: 'Rücknahme von #3' });
    expect(row['change']).toBe('Temperatur: 9,6 °C → 19,6 °C. Grund: Ausreißer, Nachbarstunden 9,4/9,8 °C');
    expect(row['hour']).toEqual({ link: ['/admin/korrektur', '2026-11-19'], text: '19.11.2026, 14:00', label: '19.11.2026, 14:00 Uhr korrigieren' });
  });
});
