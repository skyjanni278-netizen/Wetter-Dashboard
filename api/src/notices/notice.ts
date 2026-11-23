import type { NoticeComparator, NoticeField, NoticeType } from './notice-threshold.entity';

/** Ein Hinweis aus der Vorhersage (03 B2.2 „notices“, US20-1). `value` gerundet (R11), `threshold` wie gespeichert. */
export interface Notice {
  /** `{date}-{type}`, z. B. `2026-11-21-frost`. */
  id: string;
  type: NoticeType;
  date: string;
  value: number;
  threshold: number;
  comparator: NoticeComparator;
  unit: string;
}

/** `GET /api/notices`: Hinweise und der Abrufzeitpunkt der zugrunde liegenden Vorhersage (`null` ohne Vorhersage, US20-3). */
export interface NoticeList {
  items: Notice[];
  basedOnFetchedAt: string | null;
}

/** Eine Schwelle wie in der Tabelle `notice_threshold` (ohne `id`). */
export interface NoticeThresholdValues {
  type: NoticeType;
  field: NoticeField;
  comparator: NoticeComparator;
  value: number;
  unit: string;
}

/**
 * R30 (03, N07; **A:** noch zu bestätigen): Frost `minTemp < 0`, Hitze `maxTemp ≥ 30`, Starkregen
 * `precipitationSum ≥ 20`. Quelle der Daten-Migration `Hinweisschwellen`; zur Laufzeit gelten die Zeilen der
 * Tabelle.
 */
export const R30_THRESHOLDS: readonly NoticeThresholdValues[] = [
  { type: 'frost', field: 'min_temp', comparator: 'lt', value: 0, unit: '°C' },
  { type: 'heat', field: 'max_temp', comparator: 'gte', value: 30, unit: '°C' },
  { type: 'heavy_rain', field: 'precipitation_sum', comparator: 'gte', value: 20, unit: 'mm' },
];

/** R30: ungerundeter Vergleich; `null` (Wert unbekannt) ergibt nie einen Hinweis. */
export function exceedsThreshold(value: number | null, comparator: NoticeComparator, threshold: number): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  return comparator === 'lt' ? value < threshold : value >= threshold;
}

/** `id` eines Hinweises (B2.2): `{date}-{type}`. */
export function noticeId(date: string, type: NoticeType): string {
  return `${date}-${type}`;
}
