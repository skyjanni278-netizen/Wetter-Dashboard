import { localDateTime } from '../common/berlin-time';
import { formatUtc } from '../common/utc';

/**
 * Wie die Ortszeiten (`time`, ohne Offset) der Altdateien zu lesen sind (03 Z1, B2.7 Schritt 2):
 * - `fixed+01:00`: fester Offset +01:00 für jede Stunde, auch im Sommer (eine lange Archivabfrage mit
 *   `timezone=Europe/Berlin`, die Open-Meteo mit dem Offset des ersten Tages beschriftet),
 * - `europe-berlin`: echte Berliner Ortszeit (MEZ/MESZ).
 */
export const LEGACY_TIME_RULES = ['fixed+01:00', 'europe-berlin'] as const;
export type LegacyTimeRule = (typeof LEGACY_TIME_RULES)[number];

/**
 * Regel für den Altdatenimport, festgelegt mit der DST-Stichprobe `npm run cli -- legacy:dst-check` am
 * 22.11.2026 (Ergebnis in docs/PROJEKTDOKU.md 3a.13): Die Temperaturreihen der vier Stichtage stimmen mit dem
 * Archiv bei festem Offset +01:00 überein, mit Europe/Berlin sind alle Sommerstunden um 1 h versetzt.
 */
export const LEGACY_TIME_RULE: LegacyTimeRule = 'fixed+01:00';

const HOUR_MS = 60 * 60 * 1000;
const LOCAL_HOUR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;

/** Ortszeit `YYYY-MM-DDTHH:00` als Zeitpunkt, als wäre sie UTC (Hilfswert für die Umrechnung). */
function asUtc(time: string): number | null {
  const match = LOCAL_HOUR.exec(time);
  if (!match) return null;
  const [, y, m, d, h] = match.map(Number);
  return Date.UTC(y, m - 1, d, h);
}

/**
 * Zeitpunkt (UTC, `YYYY-MM-DDTHH:MM:SSZ`) einer Stunde der Altdatei nach der Regel. `null`, wenn es die
 * Ortszeit nicht gibt (`europe-berlin`: 02:00 am Tag der Umstellung auf Sommerzeit). Bei einer doppelten
 * Ortszeit (02:00 im Oktober) gilt die erste, also MESZ.
 */
export function legacyTimeToUtc(time: string, rule: LegacyTimeRule = LEGACY_TIME_RULE): string | null {
  const naive = asUtc(time);
  if (naive === null) return null;
  if (rule === 'fixed+01:00') return formatUtc(new Date(naive - HOUR_MS));
  for (const offsetHours of [2, 1]) {
    const instant = new Date(naive - offsetHours * HOUR_MS);
    if (localDateTime(instant) === time) return formatUtc(instant);
  }
  return null;
}
