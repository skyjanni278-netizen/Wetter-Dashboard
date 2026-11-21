import { round1 } from './round';

describe('round1 (R11, nur im Response-Mapper)', () => {
  it.each([
    [30.04, 30],
    [30.05, 30.1],
    [2.25, 2.3],
    [-2.25, -2.3],
    [1.15, 1.2],
    [0.6 * 9, 5.4],
    [0.1 + 0.2, 0.3],
    [-13.94, -13.9],
    [12, 12],
  ])('%p → %p', (value, expected) => {
    expect(round1(value)).toBe(expected);
  });

  it('−0,04 wird 0 und nicht −0', () => {
    expect(Object.is(round1(-0.04), 0)).toBe(true);
    expect(Object.is(round1(-0), 0)).toBe(true);
  });

  it('null bleibt null, NaN wird null', () => {
    expect(round1(null)).toBeNull();
    expect(round1(Number.NaN)).toBeNull();
  });
});
