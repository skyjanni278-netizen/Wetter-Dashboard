import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CorrectionPageComponent } from './correction-page';
import { RELOADED_MESSAGE } from './hour-correction';
import { apiErrorInterceptor } from '../../../interceptors/api-error.interceptor';
import { MERGE_PATCH_CONTENT_TYPE } from '../../../services/admin-api.service';
import {
  CONFLICT_MESSAGE, NOT_REVERSIBLE_MESSAGE, NO_CHANGE_MESSAGE, PREDICTION_MESSAGE, REASON_REQUIRED_MESSAGE,
} from '../../../utils/correction-format';
import { apiErrorBody, correction, observation } from '../../../testing/admin-fixtures';
import type { CorrectionResource, Day, DayHour } from '../../../models/api';

function hour(h: number, overrides: Partial<DayHour> = {}): DayHour {
  return {
    id: 16489 + h, timeLocal: `2026-11-19T${String(h).padStart(2, '0')}:00`, temperature: 8.9, apparentTemperature: 4.2,
    precipitation: 0, weatherCode: 3, windSpeed: 22.8, windDirection: 235, source: 'forecast_api', isPrediction: false,
    correctedAt: null, ...overrides,
  };
}

/** 19.11.2026 bei 14:30: 13:00 korrigiert, 14:00 vergangen (16503), 15:00 Vorhersage. */
function day(): Day {
  return {
    id: '2026-11-19', date: '2026-11-19', locationId: 1, timezone: 'Europe/Berlin', isToday: true,
    hoursExpected: 24, hoursObserved: 2, hoursPredicted: 1, complete: false, current: null,
    observed: { temperature: { mean: null, min: null, max: null, minAt: null, maxAt: null }, precipitationSum: null, isDryDay: null },
    predicted: { temperature: { min: null, max: null }, precipitationSum: null },
    hours: [
      hour(13, { correctedAt: '2026-11-19T13:20:00Z' }),
      hour(14, { temperature: 19.6, apparentTemperature: 5.1, precipitation: 0.4, weatherCode: 61, windSpeed: 21.3, windDirection: 232 }),
      hour(15, { source: 'prediction', isPrediction: true }),
    ],
  };
}

const ID = 16503;
const tick = () => new Promise(resolve => setTimeout(resolve));

async function setup(url = '/admin/korrektur/2026-11-19') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/korrektur/:date', component: CorrectionPageComponent }], withComponentInputBinding()),
      provideHttpClient(withInterceptors([apiErrorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  document.body.appendChild(harness.fixture.nativeElement);
  await harness.navigateByUrl(url, CorrectionPageComponent);
  harness.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = harness.routeNativeElement as HTMLElement;
  const item = (label: string) =>
    Array.from(el.querySelectorAll('.hour-item')).find(li => li.querySelector('h3')?.textContent?.trim() === label) as HTMLElement;
  const field = (name: string) => el.querySelector(`#corr-${ID}-${name}`) as HTMLInputElement | HTMLTextAreaElement;

  function type(name: string, value: string) {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }
  function submit() {
    (item('14:00 Uhr').querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  }
  /** Öffnet 14:00 und beantwortet GET Stunde (ETag) und Historie. */
  async function open(history: CorrectionResource[] = [], current = observation()) {
    (item('14:00 Uhr').querySelector('.hour-toggle') as HTMLButtonElement).click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    http.expectOne(`/api/observations/${ID}`).flush(current, { headers: { ETag: `"${current.version}"` } });
    http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: history });
    harness.detectChanges();
  }
  const feedback = () => item('14:00 Uhr').querySelector('.hour-feedback') as HTMLElement;
  const cleanup = () => harness.fixture.nativeElement.remove();
  return { harness, http, el, item, field, type, submit, open, feedback, cleanup };
}

describe('CorrectionPageComponent /admin/korrektur/:date (N03)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  afterEach(() => {
    ctx?.http.verify();
    ctx?.cleanup();
  });

  it('Stunden aus /api/days/:date; Vorhersagestunde nicht korrigierbar, korrigierte Stunde mit Chip', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    expect(ctx.el.querySelector('h1')?.textContent?.trim()).toBe('Korrektur 19.11.2026');
    expect(ctx.el.querySelectorAll('.hour-item').length).toBe(3);

    const prediction = ctx.item('15:00 Uhr');
    expect(prediction.querySelector('.hour-toggle')).toBeNull();
    expect(prediction.textContent).toContain('Nicht korrigierbar');
    expect(prediction.querySelector('app-chip.chip-forecast')?.textContent).toContain('Vorhersage');

    expect(ctx.item('13:00 Uhr').querySelector('app-chip')?.textContent?.trim()).toBe('Korrigiert');
    const toggle = ctx.item('14:00 Uhr').querySelector('.hour-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(`hour-panel-${ID}`);
  });

  it('Korrektur: PATCH mit If-Match aus dem ETag, merge-patch+json und nur den geänderten Feldern; danach Erfolg, Fokus, frische Daten', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    expect((ctx.item('14:00 Uhr').querySelector('.hour-toggle') as HTMLElement).getAttribute('aria-expanded')).toBe('true');
    expect(ctx.field('temperature').value).toBe('19,6');

    ctx.type('temperature', '9,6');
    ctx.type('reason', 'Ausreißer, Nachbarstunden 9,4/9,8 °C');
    ctx.submit();
    const patch = ctx.http.expectOne(r => r.method === 'PATCH');
    expect(patch.request.url).toBe(`/api/observations/${ID}`);
    expect(patch.request.headers.get('If-Match')).toBe('"3"');
    expect(patch.request.headers.get('Content-Type')).toBe(MERGE_PATCH_CONTENT_TYPE);
    expect(patch.request.body).toEqual({ temperature: 9.6, reason: 'Ausreißer, Nachbarstunden 9,4/9,8 °C' });

    patch.flush(observation({ temperature: 9.6, version: 4, correctedAt: '2026-11-19T13:30:00Z' }), { headers: { ETag: '"4"' } });
    ctx.harness.detectChanges();
    expect(ctx.feedback().querySelector('app-notice.notice-success')?.textContent)
      .toContain('Korrektur gespeichert: Temperatur 19,6 °C → 9,6 °C.');
    ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: [correction()] });
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await tick();
    expect(document.activeElement).toBe(ctx.feedback());
    expect(ctx.field('reason').value).toBe('');

    // Der neue ETag gilt für die nächste Korrektur
    ctx.type('windSpeed', '25');
    ctx.type('reason', 'Böe');
    ctx.submit();
    const second = ctx.http.expectOne(r => r.method === 'PATCH');
    expect(second.request.headers.get('If-Match')).toBe('"4"');
    expect(second.request.body).toEqual({ windSpeed: 25, reason: 'Böe' });
    second.flush(observation({ temperature: 9.6, windSpeed: 25, version: 5 }), { headers: { ETag: '"5"' } });
    ctx.harness.detectChanges();
    ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: [] });
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
  });

  it('leeres Feld setzt den Wert auf null (unbekannt); ohne Änderung kein Request und eine Meldung', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    ctx.type('reason', 'Prüfung');
    ctx.submit();
    ctx.http.expectNone(r => r.method === 'PATCH');
    expect(ctx.feedback().textContent).toContain(NO_CHANGE_MESSAGE);

    ctx.type('precipitation', '');
    ctx.submit();
    const patch = ctx.http.expectOne(r => r.method === 'PATCH');
    expect(patch.request.body).toEqual({ precipitation: null, reason: 'Prüfung' });
    patch.flush(observation({ precipitation: null, version: 4 }), { headers: { ETag: '"4"' } });
    ctx.harness.detectChanges();
    ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: [] });
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
  });

  it('Feldfehler im Browser: Grenze und Pflichtfeld „Grund“ am Feld mit aria-invalid/aria-describedby, Fokus aufs erste Feld, kein Request', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    ctx.type('temperature', '51');
    ctx.submit();
    await tick();
    ctx.harness.detectChanges();
    ctx.http.expectNone(r => r.method === 'PATCH');
    const temperature = ctx.field('temperature');
    expect(temperature.getAttribute('aria-invalid')).toBe('true');
    expect(temperature.getAttribute('aria-describedby')).toContain(`corr-${ID}-temperature-error`);
    expect(ctx.el.querySelector(`#corr-${ID}-temperature-error`)?.textContent).toContain('Die Temperatur muss zwischen −50 und 50 °C liegen.');
    expect(ctx.field('reason').getAttribute('aria-invalid')).toBe('true');
    expect(ctx.el.querySelector(`#corr-${ID}-reason-error`)?.textContent).toContain(REASON_REQUIRED_MESSAGE);
    expect(document.activeElement).toBe(temperature);
  });

  it('400 vom Server: Meldung am Feld (applyServerErrors), Fehler ohne Feld oben', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    ctx.type('temperature', '9,6');
    ctx.type('reason', 'Ausreißer');
    ctx.submit();
    ctx.http.expectOne(r => r.method === 'PATCH').flush(
      apiErrorBody(400, 'VALIDATION_FAILED', 'Die Anfrage ist ungültig.', [
        { field: 'temperature', code: 'too_big', message: 'Die Temperatur muss zwischen −50 und 50 °C liegen.' },
      ]),
      { status: 400, statusText: 'Bad Request' },
    );
    ctx.harness.detectChanges();
    await tick();
    ctx.harness.detectChanges();
    expect(ctx.field('temperature').getAttribute('aria-invalid')).toBe('true');
    expect(ctx.el.querySelector(`#corr-${ID}-temperature-error`)?.textContent).toContain('Die Temperatur muss zwischen');
    expect(ctx.feedback().querySelector('app-notice')).toBeNull();
  });

  it('412: „Der Wert wurde inzwischen geändert. Neu laden?“ mit „Neu laden“ → frische Werte und neuer ETag', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    ctx.type('temperature', '9,6');
    ctx.type('reason', 'Ausreißer');
    ctx.submit();
    ctx.http.expectOne(r => r.method === 'PATCH').flush(
      apiErrorBody(412, 'PRECONDITION_FAILED', 'Die Stunde wurde inzwischen geändert.'), { status: 412, statusText: 'Precondition Failed' },
    );
    ctx.harness.detectChanges();
    const box = ctx.feedback().querySelector('app-notice')!;
    expect(box.classList).toContain('notice-error');
    expect(box.textContent).toContain(CONFLICT_MESSAGE);
    await tick();
    expect(document.activeElement).toBe(ctx.feedback());

    (box.querySelector('button.hour-reload') as HTMLButtonElement).click();
    ctx.harness.detectChanges();
    ctx.http.expectOne(`/api/observations/${ID}`).flush(observation({ temperature: 18.2, version: 4 }), { headers: { ETag: '"4"' } });
    ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: [] });
    ctx.harness.detectChanges();
    expect(ctx.field('temperature').value).toBe('18,2');
    expect(ctx.feedback().textContent).toContain(RELOADED_MESSAGE);

    ctx.type('temperature', '9,6');
    ctx.type('reason', 'Ausreißer');
    ctx.submit();
    const retry = ctx.http.expectOne(r => r.method === 'PATCH');
    expect(retry.request.headers.get('If-Match')).toBe('"4"');
    retry.flush(observation({ temperature: 9.6, version: 5 }), { headers: { ETag: '"5"' } });
    ctx.harness.detectChanges();
    ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({ items: [] });
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
  });

  it('409 OBSERVATION_IS_PREDICTION: verständliche Meldung', async () => {
    ctx = await setup();
    ctx.http.expectOne('/api/days/2026-11-19').flush(day());
    ctx.harness.detectChanges();
    await ctx.open();
    ctx.type('temperature', '9,6');
    ctx.type('reason', 'Ausreißer');
    ctx.submit();
    ctx.http.expectOne(r => r.method === 'PATCH').flush(
      apiErrorBody(409, 'OBSERVATION_IS_PREDICTION', 'Die Stunde ist eine Vorhersage.'), { status: 409, statusText: 'Conflict' },
    );
    ctx.harness.detectChanges();
    expect(ctx.feedback().textContent).toContain(PREDICTION_MESSAGE);
  });

  describe('Rücknahme (R33, US13-16 bis -18)', () => {
    const corrected = observation({ temperature: 9.6, version: 4, correctedAt: '2026-11-19T13:20:00Z' });

    async function openWithHistory() {
      ctx = await setup();
      ctx.http.expectOne('/api/days/2026-11-19').flush(day());
      ctx.harness.detectChanges();
      await ctx.open([correction()], corrected);
      return ctx.item('14:00 Uhr');
    }

    it('„Zurücknehmen“ mit Pflichtfeld „Grund“: POST …/reversal mit If-Match; Erfolg mit altem Wert', async () => {
      const item = await openWithHistory();
      const entry = item.querySelector('.history-item')!;
      expect(entry.textContent).toContain('Temperatur');
      expect(entry.textContent).toContain('19,6 °C → 9,6 °C');
      const revert = entry.querySelector('.history-revert') as HTMLButtonElement;
      expect(revert.textContent?.trim()).toBe('Zurücknehmen');
      revert.click();
      ctx.harness.detectChanges();
      await tick();
      const reason = ctx.field('reversal-3') as HTMLTextAreaElement;
      expect(document.activeElement).toBe(reason);

      // ohne Grund: Meldung am Feld, kein Request
      (Array.from(entry.querySelectorAll('button')).find(b => b.textContent?.includes('Rücknahme speichern')) as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      ctx.http.expectNone(r => r.url.endsWith('/reversal'));
      expect(reason.getAttribute('aria-invalid')).toBe('true');

      ctx.type('reversal-3', 'Rücknahme: Wert war plausibel');
      (Array.from(entry.querySelectorAll('button')).find(b => b.textContent?.includes('Rücknahme speichern')) as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      const post = ctx.http.expectOne(`/api/observations/${ID}/corrections/3/reversal`);
      expect(post.request.method).toBe('POST');
      expect(post.request.headers.get('If-Match')).toBe('"4"');
      expect(post.request.body).toEqual({ reason: 'Rücknahme: Wert war plausibel' });
      post.flush(observation({ temperature: 19.6, version: 5, correctedAt: null }), { headers: { ETag: '"5"' } });
      ctx.harness.detectChanges();
      expect(ctx.feedback().textContent).toContain('Korrektur #3 zurückgenommen: Temperatur wieder 19,6 °C.');
      ctx.http.expectOne(`/api/observations/${ID}/corrections`).flush({
        items: [correction({ id: 6, oldValue: 9.6, newValue: 19.6, revertsCorrectionId: 3, correctedAt: '2026-11-19T13:30:00Z' }), correction()],
      });
      ctx.http.expectOne('/api/days/2026-11-19').flush(day());
      ctx.harness.detectChanges();
      expect(item.querySelectorAll('.history-revert').length).toBe(0);
      expect(item.textContent).toContain('Rücknahme von #3');
    });

    it('„Abbrechen“ schließt das Feld und setzt den Fokus zurück auf „Zurücknehmen“', async () => {
      const item = await openWithHistory();
      (item.querySelector('.history-revert') as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      (Array.from(item.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Abbrechen') as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      await tick();
      expect(document.activeElement).toBe(item.querySelector('.history-revert'));
    });

    it('409 CORRECTION_NOT_REVERSIBLE: verständliche Meldung, Historie neu', async () => {
      const item = await openWithHistory();
      (item.querySelector('.history-revert') as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      ctx.type('reversal-3', 'Rücknahme');
      (Array.from(item.querySelectorAll('button')).find(b => b.textContent?.includes('Rücknahme speichern')) as HTMLButtonElement).click();
      ctx.http.expectOne(`/api/observations/${ID}/corrections/3/reversal`).flush(
        apiErrorBody(409, 'CORRECTION_NOT_REVERSIBLE', 'Die Korrektur ist nicht rücknehmbar.'), { status: 409, statusText: 'Conflict' },
      );
      ctx.harness.detectChanges();
      expect(ctx.feedback().textContent).toContain(NOT_REVERSIBLE_MESSAGE);
      const reload: TestRequest = ctx.http.expectOne(`/api/observations/${ID}/corrections`);
      reload.flush({ items: [correction({ id: 6, revertsCorrectionId: 3, correctedAt: '2026-11-19T13:30:00Z' }), correction()] });
      ctx.harness.detectChanges();
      expect(item.querySelectorAll('.history-revert').length).toBe(0);
    });

    it('412 bei der Rücknahme: Konfliktmeldung mit „Neu laden“', async () => {
      const item = await openWithHistory();
      (item.querySelector('.history-revert') as HTMLButtonElement).click();
      ctx.harness.detectChanges();
      ctx.type('reversal-3', 'Rücknahme');
      (Array.from(item.querySelectorAll('button')).find(b => b.textContent?.includes('Rücknahme speichern')) as HTMLButtonElement).click();
      ctx.http.expectOne(`/api/observations/${ID}/corrections/3/reversal`).flush(
        apiErrorBody(412, 'PRECONDITION_FAILED', 'veraltet'), { status: 412, statusText: 'Precondition Failed' },
      );
      ctx.harness.detectChanges();
      expect(ctx.feedback().textContent).toContain(CONFLICT_MESSAGE);
      expect(ctx.feedback().querySelector('button.hour-reload')).not.toBeNull();
    });
  });

  it('ungültiges Datum: Hinweis, kein Request', async () => {
    ctx = await setup('/admin/korrektur/2026-02-30');
    ctx.http.expectNone(r => r.url.startsWith('/api/days'));
    expect(ctx.el.textContent).toContain('Die Adresse enthält kein gültiges Datum');
  });

  it('404 NO_DATA: Leerzustand; 400 (Zukunft): Meldung ohne „Erneut versuchen“', async () => {
    ctx = await setup('/admin/korrektur/2024-12-31');
    ctx.http.expectOne('/api/days/2024-12-31').flush(
      apiErrorBody(404, 'NO_DATA', 'Für den 31.12.2024 liegen keine Daten vor.'), { status: 404, statusText: 'Not Found' },
    );
    ctx.harness.detectChanges();
    expect(ctx.el.querySelector('app-empty')?.textContent).toContain('Für den 31.12.2024 liegen keine Stunden vor.');
    ctx.http.verify();
    ctx.cleanup();
    TestBed.resetTestingModule();

    ctx = await setup('/admin/korrektur/2026-12-01');
    ctx.http.expectOne('/api/days/2026-12-01').flush(
      apiErrorBody(400, 'DATE_IN_FUTURE', 'Das Datum liegt in der Zukunft.', [{ field: 'date', code: 'DATE_IN_FUTURE', message: 'x' }]),
      { status: 400, statusText: 'Bad Request' },
    );
    ctx.harness.detectChanges();
    const error = ctx.el.querySelector('app-error')!;
    expect(error.textContent).toContain('Das Datum liegt in der Zukunft.');
    expect(error.querySelector('button')).toBeNull();
  });
});
