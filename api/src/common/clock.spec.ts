import { Clock, FixedClock, SystemClock } from './clock';

describe('Clock (C6)', () => {
  it('SystemClock liefert die aktuelle Zeit', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('FixedClock liefert immer denselben Zeitpunkt', () => {
    const clock: Clock = new FixedClock('2026-11-19T23:30:00Z');
    expect(clock.now().toISOString()).toBe('2026-11-19T23:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-19T23:30:00.000Z');
  });

  it('FixedClock gibt Kopien zurück; Änderungen am Ergebnis verstellen die Uhr nicht', () => {
    const clock = new FixedClock(new Date('2026-07-19T22:30:00Z'));
    clock.now().setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe('2026-07-19T22:30:00.000Z');
  });

  it('FixedClock lässt sich setzen und vorstellen', () => {
    const clock = new FixedClock('2026-11-19T13:30:00Z');
    clock.advance(60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-11-19T14:30:00.000Z');
    clock.set('2026-11-20T00:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('FixedClock wirft bei ungültigem Zeitpunkt', () => {
    expect(() => new FixedClock('kein Datum')).toThrow(RangeError);
  });
});
