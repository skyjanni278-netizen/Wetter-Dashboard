import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { AppThrottlerGuard, GLOBAL_THROTTLE_TTL_MS, globalThrottler, throttlerOptions } from './throttling';

class DaysController {
  list(): void {}
  one(): void {}
}

function context(handler: () => void, headers: Record<string, string>) {
  const req = { ip: '127.0.0.1', headers: {} };
  const res = {
    headersSent: false,
    setHeader: (name: string, value: string) => (headers[name] = String(value)),
    header: (name: string, value: string) => (headers[name] = String(value)),
  };
  return {
    getClass: () => DaysController,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('Throttler (03 B4.8, C1 A06/A07)', () => {
  it('Optionen: globales Limit (60 s) und Login-Limit', () => {
    const options = throttlerOptions(120) as { throttlers: { name: string; limit: number; ttl: number }[] };
    expect(options.throttlers.map(t => [t.name, t.limit, t.ttl])).toEqual([
      ['global', 120, GLOBAL_THROTTLE_TTL_MS],
      ['login', 5, 60_000],
    ]);
  });

  it('globaler Schlüssel hängt nur an der IP, nicht an der Route', () => {
    const generateKey = globalThrottler(120).generateKey!;
    const a = generateKey(context(DaysController.prototype.list, {}), '127.0.0.1', 'global');
    const b = generateKey(context(DaysController.prototype.one, {}), '127.0.0.1', 'global');
    const c = generateKey(context(DaysController.prototype.one, {}), '10.0.0.7', 'global');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('dritte Anfrage bei Limit 2 → ThrottlerException und Standard-Header Retry-After (Sekunden)', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new AppThrottlerGuard(throttlerOptions(2), storage, new Reflector());
    await guard.onModuleInit();
    const headers: Record<string, string> = {};
    await expect(guard.canActivate(context(DaysController.prototype.list, headers))).resolves.toBe(true);
    await expect(guard.canActivate(context(DaysController.prototype.one, headers))).resolves.toBe(true);
    await expect(guard.canActivate(context(DaysController.prototype.list, headers))).rejects.toBeInstanceOf(ThrottlerException);
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(60);
    expect(headers['Retry-After-global']).toBeDefined();
    storage.onApplicationShutdown();
  });
});
