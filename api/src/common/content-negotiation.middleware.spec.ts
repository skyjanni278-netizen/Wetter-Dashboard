import type { NextFunction, Request, Response } from 'express';
import { ApiException } from './api.exception';
import { acceptsJson, contentNegotiationError, ContentNegotiationMiddleware, hasBody } from './content-negotiation.middleware';

describe('ContentNegotiationMiddleware (B3.2: 406 und 415)', () => {
  describe('acceptsJson', () => {
    it.each([
      [undefined, true],
      ['', true],
      ['application/json', true],
      ['*/*', true],
      ['application/*', true],
      ['text/html, application/json;q=0.9', true],
      ['APPLICATION/JSON; charset=utf-8', true],
      ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', true],
      ['text/html', false],
      ['text/plain, image/png', false],
      ['application/json;q=0', false],
      ['application/xml', false],
    ])('Accept %p → %p', (accept, expected) => {
      expect(acceptsJson(accept)).toBe(expected);
    });
  });

  it('hasBody: Content-Length > 0 oder Transfer-Encoding', () => {
    expect(hasBody({ 'content-length': '1' })).toBe(true);
    expect(hasBody({ 'transfer-encoding': 'chunked' })).toBe(true);
    expect(hasBody({ 'content-length': '0' })).toBe(false);
    expect(hasBody({})).toBe(false);
  });

  it('406 NOT_ACCEPTABLE bei Accept: text/html', () => {
    const error = contentNegotiationError('GET', { accept: 'text/html' });
    expect(error).toBeInstanceOf(ApiException);
    expect(error?.payload).toMatchObject({ statusCode: 406, error: 'Not Acceptable', code: 'NOT_ACCEPTABLE', errors: [] });
  });

  it('415 bei POST mit text/plain oder ohne Content-Type, ok mit application/json; charset=utf-8', () => {
    expect(contentNegotiationError('POST', { 'content-type': 'text/plain', 'content-length': '1' })?.payload).toMatchObject({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    expect(contentNegotiationError('POST', { 'content-length': '5' })?.payload.statusCode).toBe(415);
    expect(
      contentNegotiationError('POST', { 'content-type': 'application/json; charset=utf-8', 'content-length': '2' }),
    ).toBeNull();
  });

  it('POST ohne Body bleibt unberührt (die Pipe meldet 400), GET mit Body auch', () => {
    expect(contentNegotiationError('POST', { 'content-type': 'text/plain' })).toBeNull();
    expect(contentNegotiationError('GET', { 'content-type': 'text/plain', 'content-length': '3' })).toBeNull();
  });

  it('PATCH verlangt application/merge-patch+json', () => {
    const headers = { 'content-length': '2' };
    expect(contentNegotiationError('PATCH', { ...headers, 'content-type': 'application/json' })?.payload.statusCode).toBe(415);
    expect(contentNegotiationError('PATCH', { ...headers, 'content-type': 'application/merge-patch+json' })).toBeNull();
  });

  it('use: reicht den Fehler an next weiter, sonst next() ohne Argument', () => {
    const middleware = new ContentNegotiationMiddleware();
    const next = jest.fn() as unknown as NextFunction & jest.Mock;
    middleware.use({ method: 'GET', headers: { accept: 'text/html' } } as Request, {} as Response, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiException);
    middleware.use({ method: 'GET', headers: {} } as Request, {} as Response, next);
    expect(next.mock.calls[1]).toEqual([]);
  });

  it('B3.1: mit Swagger ist /api/docs* von der 406-Prüfung ausgenommen (Swagger UI ist HTML), andere Pfade nicht', () => {
    const middleware = new ContentNegotiationMiddleware(true);
    const next = jest.fn() as unknown as NextFunction & jest.Mock;
    const html = { accept: 'text/html' };
    for (const path of ['/api/docs', '/api/docs/', '/api/docs/swagger-ui.css', '/api/docs-json']) {
      middleware.use({ method: 'GET', path, headers: html } as Request, {} as Response, next);
    }
    expect(next.mock.calls).toEqual([[], [], [], []]);
    middleware.use({ method: 'GET', path: '/api/days', headers: html } as Request, {} as Response, next);
    middleware.use({ method: 'GET', path: '/api/docsx', headers: html } as Request, {} as Response, next);
    expect(next.mock.calls[4][0]).toBeInstanceOf(ApiException);
    expect(next.mock.calls[5][0]).toBeInstanceOf(ApiException);
  });

  it('ohne Swagger (Standard) gilt die 406-Prüfung auch für /api/docs*', () => {
    const middleware = new ContentNegotiationMiddleware();
    const next = jest.fn() as unknown as NextFunction & jest.Mock;
    for (const path of ['/api/docs', '/api/docs-json']) {
      middleware.use({ method: 'GET', path, headers: { accept: 'text/html' } } as Request, {} as Response, next);
    }
    expect(next.mock.calls.map(call => call[0])).toEqual([expect.any(ApiException), expect.any(ApiException)]);
  });
});
