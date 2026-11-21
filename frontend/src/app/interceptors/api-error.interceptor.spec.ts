import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApiErrorResponse, apiErrorInterceptor, apiErrorOf, toApiError } from './api-error.interceptor';
import { WeatherService } from '../services/weather.service';
import type { ApiError } from '../models/api';

const NO_DATA: ApiError = {
  statusCode: 404,
  error: 'Not Found',
  code: 'NO_DATA',
  message: 'Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab 01.01.2025.',
  errors: [],
  path: '/api/days/2024-12-31',
  timestamp: '2026-11-20T10:00:00Z',
  requestId: 'b6f1c0d2',
  details: { dataFrom: '2025-01-01' },
};

function response(status: number, error: unknown, statusText = 'Error'): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText, error, url: '/api/x' });
}

describe('toApiError', () => {
  it('B3.3-Body bleibt unverändert (NO_DATA mit details, path, timestamp, requestId)', () => {
    expect(toApiError(response(404, NO_DATA, 'Not Found'))).toEqual(NO_DATA);
  });

  it('400 mit errors[] (Schritt 4) bleibt erhalten', () => {
    const body: ApiError = {
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'Die Anfrage enthält ungültige Werte.',
      errors: [{ field: 'to', code: 'to_before_from', message: '„Bis“ liegt vor „Von“.' }],
      details: null,
    };
    expect(toApiError(response(400, body))).toEqual(body);
  });

  it('Express { error } → Status bleibt, code je Status, message von Express', () => {
    expect(toApiError(response(404, { error: 'Keine Daten für 2024-12-31 gefunden.' }, 'Not Found'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NOT_FOUND',
      message: 'Keine Daten für 2024-12-31 gefunden.',
      errors: [],
      details: null,
    });
    expect(toApiError(response(400, { error: 'Ungültiges Datumsformat.' }))).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Ungültiges Datumsformat.',
    });
  });

  it('Netzwerkfehler (Status 0) → SERVICE_UNAVAILABLE, „Server nicht erreichbar.“', () => {
    const network = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', error: new ProgressEvent('error') });
    expect(toApiError(network)).toMatchObject({
      statusCode: 0,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Server nicht erreichbar.',
      errors: [],
      details: null,
    });
  });

  it('Proxy-5xx mit HTML/Text → nicht erreichbar bzw. „Interner Fehler“, Text des Proxys nie in message', () => {
    expect(toApiError(response(504, '<html>Error occurred while trying to proxy</html>'))).toMatchObject({
      statusCode: 504,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Server nicht erreichbar.',
    });
    const internal = toApiError(response(500, { error: 'TypeError: x is undefined' }));
    expect(internal).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Interner Fehler' });
  });

  it('Body ohne Text → allgemeine Meldung', () => {
    expect(toApiError(response(409, null)).message).toBe('Die Anfrage konnte nicht verarbeitet werden.');
    expect(toApiError(response(409, null)).code).toBe('CONFLICT');
  });

  it('apiErrorOf: mit und ohne Interceptor, auch für Nicht-HTTP-Fehler', () => {
    const raw = response(404, NO_DATA, 'Not Found');
    expect(apiErrorOf(new ApiErrorResponse(raw))).toEqual(NO_DATA);
    expect(apiErrorOf(raw)).toEqual(NO_DATA);
    expect(apiErrorOf(new Error('x'))).toMatchObject({ statusCode: 0, code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  async function failWith(url: string, body: object, init: { status: number; statusText: string }) {
    const result = firstValueFrom(http.get(url)).then(
      () => { throw new Error('erwartet: Fehler'); },
      (error: unknown) => error,
    );
    controller.expectOne(url).flush(body, init);
    return result;
  }

  it('Fehler der neuen API kommt als ApiErrorResponse mit apiError nach B3.3', async () => {
    const error = await failWith('/api/days/2024-12-31', NO_DATA, { status: 404, statusText: 'Not Found' });
    expect(error).toBeInstanceOf(ApiErrorResponse);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as ApiErrorResponse).apiError).toEqual(NO_DATA);
  });

  it('V20 bleibt: status und der Express-Body error.error sind unverändert sichtbar', async () => {
    const body = { error: 'Keine Daten für heute gefunden. Warte auf ersten Abruf.' };
    const error = (await failWith('/api/data/today', body, { status: 404, statusText: 'Not Found' })) as ApiErrorResponse;
    expect(error.status).toBe(404);
    expect(error.error).toEqual(body);
    expect(error.url).toBe('/api/data/today');
    expect(error.apiError).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: body.error });
  });

  it('Netzwerkfehler: status 0 bleibt, apiError „Server nicht erreichbar.“', async () => {
    const result = firstValueFrom(TestBed.inject(WeatherService).getToday()).catch((e: unknown) => e);
    controller.expectOne('/api/days/today').error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    const error = (await result) as ApiErrorResponse;
    expect(error.status).toBe(0);
    expect(error.apiError).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'Server nicht erreichbar.' });
  });

  it('Erfolg läuft unverändert durch', async () => {
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/status'));
    controller.expectOne('/api/status').flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });
});
