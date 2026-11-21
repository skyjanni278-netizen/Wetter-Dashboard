/**
 * R11: Rundung auf eine Nachkommastelle, **nur** in den Response-Mappern (einzige Stelle).
 * Verglichen und gerechnet wird vorher immer ungerundet.
 *
 * - kaufmännisch, vom Nullpunkt weg: `2.25` → `2.3`, `-2.25` → `-2.3`
 * - Gleitkomma-Reste werden vorher geglättet: `1.15` (intern 1.1499999…) → `1.2`, `0.6 * 9` → `5.4`
 * - nie `-0`: `-0.04` → `0`
 * - `null` bleibt `null` (R14)
 */
export function round1(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const scaled = Number((Math.abs(value) * 10).toPrecision(12));
  const rounded = (Math.sign(value) * Math.round(scaled)) / 10;
  return rounded === 0 ? 0 : rounded;
}
