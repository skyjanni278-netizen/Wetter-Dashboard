import { Logger } from '@nestjs/common';
import { FixedClock, SystemClock } from './clock';
import { clockFor } from './fake-now';

/** Form und Regeln von `FAKE_NOW` prüft `EnvSchema` (`src/config/env.schema.spec.ts`). */
describe('FAKE_NOW (03 B4.8)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('nicht gesetzt → SystemClock, keine Log-Zeile', () => {
    expect(clockFor(undefined)).toBeInstanceOf(SystemClock);
    expect(warn).not.toHaveBeenCalled();
  });

  it('gesetzt → FixedClock mit genau diesem Zeitpunkt, eine Log-Zeile', () => {
    const clock = clockFor('2026-11-19T13:30:00Z');
    expect(clock).toBeInstanceOf(FixedClock);
    expect(clock.now().toISOString()).toBe('2026-11-19T13:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-19T13:30:00.000Z'); // steht still
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('FAKE_NOW=2026-11-19T13:30:00Z');
  });
});
