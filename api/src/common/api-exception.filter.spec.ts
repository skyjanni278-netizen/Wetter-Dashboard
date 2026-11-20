import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExceptionFilter, isUniqueViolation, toErrorPayload } from './api-exception.filter';
import { ApiException } from './api.exception';
import { ApiValidationException } from './api-validation.exception';
import { bodyParserException } from './body-parser';
import { FixedClock } from './clock';
import { REQUEST_ID_HEADER } from './request-id';

/** Fehler wie von body-parser (http-errors): `type` und `status`. */
function parserError(type: string, status: number): Error {
  return Object.assign(new Error(`roher Parser-Text ${type}`), { type, status, statusCode: status, expose: true });
}

function hostFor(req: Partial<Request>, res: Response): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res, getNext: () => undefined }),
  } as unknown as ArgumentsHost;
}

function fakeResponse(locals: Record<string, unknown> = {}) {
  const res = {
    headersSent: false,
    locals,
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('toErrorPayload: Abbildung auf Status und code (B3.3)', () => {
  it.each([
    [new NotFoundException('Cannot GET /api/gibtsnicht'), 404, 'NOT_FOUND'],
    [new ConflictException(), 409, 'CONFLICT'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new PayloadTooLargeException(), 413, 'PAYLOAD_TOO_LARGE'],
    [new HttpException('x', 406), 406, 'NOT_ACCEPTABLE'],
    [new HttpException('x', 412), 412, 'PRECONDITION_FAILED'],
    [new HttpException('x', 415), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [new HttpException('x', 428), 428, 'PRECONDITION_REQUIRED'],
    [new HttpException('x', 429), 429, 'TOO_MANY_REQUESTS'],
    [new HttpException('x', 503), 503, 'SERVICE_UNAVAILABLE'],
    [new BadRequestException('Unexpected token'), 400, 'VALIDATION_FAILED'],
  ])('Nest-Exception %#: Status %i → %s, ohne fremden Text, errors = []', (exception, status, code) => {
    const payload = toErrorPayload(exception);
    expect(payload).toMatchObject({ statusCode: status, code, errors: [], details: null });
    expect(payload.message).not.toMatch(/Cannot GET|Unexpected token|^x$/);
  });

  it('eigene ApiException bleibt unverändert (NO_DATA mit details)', () => {
    expect(toErrorPayload(ApiException.noData('2024-12-31', '2025-01-01'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NO_DATA',
      message: 'Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab 01.01.2025.',
      errors: [],
      details: { dataFrom: '2025-01-01' },
    });
  });

  it('IMPORT_RUNNING behält details.runningImportId', () => {
    expect(toErrorPayload(ApiException.importRunning(42))).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'IMPORT_RUNNING',
      details: { runningImportId: 42 },
    });
  });

  it('ApiValidationException (Schritt 4) behält errors[] und code', () => {
    const payload = toErrorPayload(ApiValidationException.dateInFuture('date', '2026-11-20'));
    expect(payload).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'DATE_IN_FUTURE',
      errors: [{ field: 'date', code: 'too_big' }],
      details: null,
    });
  });

  it('unbekannter Fehler → 500 INTERNAL_ERROR, nur „Interner Fehler“', () => {
    expect(toErrorPayload(new Error('geheim: /pfad/zur/db'))).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Interner Fehler',
      errors: [],
      details: null,
    });
    expect(toErrorPayload('kein Error-Objekt')).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(toErrorPayload(new InternalServerErrorException('geheim')).message).toBe('Interner Fehler');
  });

  it('auch eine eigene 500 zeigt nur „Interner Fehler“ ohne details', () => {
    const own = new ApiException(500, 'INTERNAL_ERROR', 'Stack: geheim', { details: { sql: 'SELECT' } });
    expect(toErrorPayload(own)).toMatchObject({ message: 'Interner Fehler', details: null });
  });

  it('Body-Parser: zu groß → 413, kaputtes JSON → 400, Zeichensatz → 415; Parser-Text nie im Body', () => {
    const tooLarge = toErrorPayload(parserError('entity.too.large', 413));
    expect(tooLarge).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    const parse = bodyParserException(parserError('entity.parse.failed', 400));
    expect(parse?.payload).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED', errors: [] });
    expect(parse?.payload.message).toBe('Der Body ist kein gültiges JSON.');
    expect(toErrorPayload(parserError('charset.unsupported', 415))).toMatchObject({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    expect(tooLarge.message).not.toContain('roher Parser-Text');
    expect(bodyParserException(new Error('kein Parser-Fehler'))).toBeNull();
  });

  it('Unique-Verletzung der DB (direkt oder als driverError) → 409 CONFLICT', () => {
    const sqlite = Object.assign(new Error('UNIQUE constraint failed: import.location_id'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    const typeorm = Object.assign(new Error('QueryFailedError'), { driverError: sqlite });
    expect(isUniqueViolation(sqlite)).toBe(true);
    expect(toErrorPayload(typeorm)).toMatchObject({ statusCode: 409, code: 'CONFLICT', errors: [] });
    expect(toErrorPayload(typeorm).message).not.toContain('UNIQUE');
    const check = Object.assign(new Error('CHECK constraint failed'), { code: 'SQLITE_CONSTRAINT_CHECK' });
    expect(toErrorPayload(check)).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
  });
});

describe('ApiExceptionFilter.catch', () => {
  const clock = new FixedClock('2026-11-19T13:19:41.456Z');
  const filter = new ApiExceptionFilter(clock);

  it('schreibt den Body nach B3.3 mit path (ohne Query), timestamp ohne ms und requestId aus res.locals', () => {
    const res = fakeResponse({ requestId: 'b6f1c0d2' });
    filter.catch(
      ApiException.noData('2024-12-31', '2025-01-01'),
      hostFor({ method: 'GET', originalUrl: '/api/days/2024-12-31?x=1' }, res as unknown as Response),
    );
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body)).toEqual([
      'statusCode',
      'error',
      'code',
      'message',
      'errors',
      'path',
      'timestamp',
      'requestId',
      'details',
    ]);
    expect(body).toMatchObject({
      code: 'NO_DATA',
      path: '/api/days/2024-12-31',
      timestamp: '2026-11-19T13:19:41Z',
      requestId: 'b6f1c0d2',
      details: { dataFrom: '2025-01-01' },
    });
  });

  it('ohne requestId (Middleware nicht durchlaufen) vergibt er eine und setzt X-Request-Id', () => {
    const res = fakeResponse();
    filter.catch(new NotFoundException(), hostFor({ method: 'GET', url: '/api/x' }, res as unknown as Response));
    const body = res.json.mock.calls[0][0];
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, body.requestId);
  });

  it('500: loggt Text und Stack mit requestId, der Body enthält davon nichts', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = fakeResponse({ requestId: 'deadbeef' });
    filter.catch(new Error('geheim'), hostFor({ method: 'GET', originalUrl: '/api/locations/1' }, res as unknown as Response));
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Interner Fehler' });
    expect(JSON.stringify(body)).not.toMatch(/geheim|stack|at /);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[deadbeef]'), expect.stringContaining('geheim'));
    log.mockRestore();
  });

  it('Antwort schon gesendet → kein zweiter Body', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const res = fakeResponse({ requestId: 'aaaaaaaa' });
    res.headersSent = true;
    filter.catch(new NotFoundException(), hostFor({ method: 'GET', url: '/api/x' }, res as unknown as Response));
    expect(res.json).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
