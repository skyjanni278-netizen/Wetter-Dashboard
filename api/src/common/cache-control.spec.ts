import type { NextFunction, Request, Response } from 'express';
import { cacheControlFor, cacheControlMiddleware } from './cache-control';

function run(method: string, path: string): string | undefined {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
  const next = jest.fn() as NextFunction;
  cacheControlMiddleware({ method, path } as Request, res, next);
  expect(next).toHaveBeenCalled();
  return headers['Cache-Control'];
}

describe('Cache-Control (03 B4.5)', () => {
  it.each([
    ['/api/records', 'no-cache'],
    ['/api/summaries/years', 'no-cache'],
    ['/api/days/2026-11-19', 'no-cache'],
    ['/api/forecasts', 'max-age=60'],
    ['/api/status', 'max-age=60'],
    ['/api/statusx', 'no-cache'],
  ])('%s → %s', (path, expected) => {
    expect(cacheControlFor(path)).toBe(expected);
    expect(run('GET', path)).toBe(expected);
  });

  it('nur GET/HEAD unter /api, nicht für POST und nicht für die Swagger-Doku', () => {
    expect(run('HEAD', '/api/records')).toBe('no-cache');
    expect(run('POST', '/api/imports')).toBeUndefined();
    expect(run('GET', '/api/docs-json')).toBeUndefined();
    expect(run('GET', '/favicon.ico')).toBeUndefined();
  });
});
