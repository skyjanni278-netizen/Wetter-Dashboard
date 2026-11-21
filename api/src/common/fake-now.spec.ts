import { Logger } from '@nestjs/common';
import { FixedClock, SystemClock } from './clock';
import { clockFromEnv, FakeNowConfigError, fakeNowFromEnv } from './fake-now';

describe('FAKE_NOW (03 B4.8)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('nicht gesetzt oder leer → SystemClock', () => {
    expect(clockFromEnv({})).toBeInstanceOf(SystemClock);
    expect(clockFromEnv({ FAKE_NOW: '  ' })).toBeInstanceOf(SystemClock);
    expect(warn).not.toHaveBeenCalled();
  });

  it('gesetzt und Scheduler aus → FixedClock mit genau diesem Zeitpunkt, eine Log-Zeile', () => {
    const clock = clockFromEnv({ FAKE_NOW: '2026-11-19T13:30:00Z' });
    expect(clock).toBeInstanceOf(FixedClock);
    expect(clock.now().toISOString()).toBe('2026-11-19T13:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-19T13:30:00.000Z'); // steht still
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('FAKE_NOW=2026-11-19T13:30:00Z');
  });

  it.each(['false', 'TRUE', '1', undefined])('SCHEDULER_ENABLED=%p gilt als aus', value => {
    expect(fakeNowFromEnv({ FAKE_NOW: '2026-11-19T13:30:00Z', SCHEDULER_ENABLED: value })).toEqual(
      new Date('2026-11-19T13:30:00Z'),
    );
  });

  it('gesetzt und SCHEDULER_ENABLED=true → Startfehler mit klarer Meldung', () => {
    expect(() => clockFromEnv({ FAKE_NOW: '2026-11-19T13:30:00Z', SCHEDULER_ENABLED: 'true' })).toThrow(
      new FakeNowConfigError(
        'FAKE_NOW ist nur mit SCHEDULER_ENABLED=false erlaubt (sonst speichert der Scheduler unter einer falschen Zeit).',
      ),
    );
  });

  it.each(['gestern', '2026-11-19', '2026-11-19T13:30:00+01:00', '2026-02-30T10:00:00Z', '2026-11-19 13:30:00Z'])(
    'ungültiger Zeitpunkt %p → Startfehler',
    value => {
      expect(() => fakeNowFromEnv({ FAKE_NOW: value })).toThrow(FakeNowConfigError);
      expect(() => fakeNowFromEnv({ FAKE_NOW: value })).toThrow(/kein gültiger Zeitpunkt/);
    },
  );
});
