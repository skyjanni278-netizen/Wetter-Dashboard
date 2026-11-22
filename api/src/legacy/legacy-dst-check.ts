import { addDays } from '../common/berlin-time';
import { HEUBACH } from '../locations/location';
import type { OpenMeteoClient } from '../weather-provider/open-meteo.client';
import { readLegacyDayFile } from './legacy-files';
import { LEGACY_TIME_RULES, legacyTimeToUtc } from './legacy-time';
import type { LegacyTimeRule } from './legacy-time';

/**
 * DST-Stichprobe (03 Z1, B2.7 Schritt 2): ein Sommertag und die drei Tage der Zeitumstellung im Altbestand.
 * Für jeden Tag holt sie die Archivwerte mit `timezone=GMT` und vergleicht die Temperaturreihe der Altdatei mit
 * beiden Lesarten der Ortszeit. Die passende Regel wird danach als `LEGACY_TIME_RULE` im Code festgehalten.
 */
export const DST_CHECK_DATES = ['2025-07-15', '2025-03-30', '2025-10-26', '2026-03-29'] as const;

/** Mittlere Abweichung (°C), bis zu der eine Reihe als „stimmt überein“ gilt (Werte haben eine Nachkommastelle). */
export const DST_MATCH_TOLERANCE = 0.1;

export interface DstRuleResult {
  /** Stunden mit Archivwert zum Vergleich. */
  compared: number;
  /** Stunden der Datei, deren Ortszeit es nach der Regel nicht gibt oder ohne Archivwert. */
  unmapped: number;
  /** Stunden mit genau gleichem Wert. */
  exact: number;
  meanAbs: number | null;
  maxAbs: number | null;
  matches: boolean;
}

export interface DstDayResult {
  date: string;
  /** Vergleich je Lesart; im Sommer liegen die beiden Lesarten genau 1 h auseinander. */
  rules: Record<LegacyTimeRule, DstRuleResult>;
}

export interface DstCheckResult {
  days: DstDayResult[];
  /** Regel, die an allen Tagen übereinstimmt, während die andere an mindestens einem Tag abweicht; sonst `null`. */
  rule: LegacyTimeRule | null;
}

function compare(
  hours: readonly { time: string; temperature: number | null }[],
  archive: ReadonlyMap<string, number | null>,
  rule: LegacyTimeRule,
): DstRuleResult {
  const diffs: number[] = [];
  let unmapped = 0;
  for (const hour of hours) {
    const timeUtc = legacyTimeToUtc(hour.time, rule);
    const reference = timeUtc === null ? undefined : archive.get(timeUtc);
    if (reference === undefined || reference === null || hour.temperature === null) {
      unmapped++;
      continue;
    }
    diffs.push(Math.abs(hour.temperature - reference));
  }
  const meanAbs = diffs.length > 0 ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null;
  const maxAbs = diffs.length > 0 ? Math.max(...diffs) : null;
  return {
    compared: diffs.length,
    unmapped,
    exact: diffs.filter(d => d < 1e-9).length,
    meanAbs,
    maxAbs,
    matches: unmapped === 0 && meanAbs !== null && meanAbs <= DST_MATCH_TOLERANCE + 1e-9,
  };
}

/** Führt die Stichprobe aus: je Tag **eine** Archivabfrage (UTC-Vortag bis Tag), nur lesend im Ordner. */
export async function runDstCheck(
  dir: string,
  client: Pick<OpenMeteoClient, 'fetchHourly'>,
  dates: readonly string[] = DST_CHECK_DATES,
): Promise<DstCheckResult> {
  const days: DstDayResult[] = [];
  for (const date of dates) {
    const file = await readLegacyDayFile(dir, date);
    const fetched = await client.fetchHourly({ source: 'archive', startDate: addDays(date, -1), endDate: date }, HEUBACH);
    const archive = new Map(fetched.map(h => [h.timeUtc, h.temperature]));
    const rules = Object.fromEntries(
      LEGACY_TIME_RULES.map(rule => [rule, compare(file.day.hourly, archive, rule)]),
    ) as Record<LegacyTimeRule, DstRuleResult>;
    days.push({ date, rules });
  }
  const fitting = LEGACY_TIME_RULES.filter(rule => days.every(day => day.rules[rule].matches));
  return { days, rule: fitting.length === 1 ? fitting[0] : null };
}

function format(value: number | null): string {
  return value === null ? '-' : value.toFixed(2);
}

/** Bericht für die Konsole (und die PROJEKTDOKU). */
export function formatDstCheck(result: DstCheckResult): string[] {
  const lines = ['Tag        | Regel          | verglichen | ohne Wert | gleich | mittl. Abw. °C | max. Abw. °C | passt'];
  for (const day of result.days) {
    for (const rule of LEGACY_TIME_RULES) {
      const r = day.rules[rule];
      lines.push(
        `${day.date} | ${rule.padEnd(14)} | ${String(r.compared).padStart(10)} | ${String(r.unmapped).padStart(9)} | ` +
          `${String(r.exact).padStart(6)} | ${format(r.meanAbs).padStart(14)} | ${format(r.maxAbs).padStart(12)} | ${r.matches ? 'ja' : 'nein'}`,
      );
    }
  }
  lines.push(
    result.rule
      ? `Regel: ${result.rule} (passt an allen ${result.days.length} Tagen, die andere Regel nicht)`
      : 'Regel: nicht eindeutig (keine oder beide Regeln passen an allen Tagen)',
  );
  return lines;
}
