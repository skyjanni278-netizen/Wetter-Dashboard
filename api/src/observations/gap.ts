/**
 * Lücke (03 B2.2, US12): zusammenhängende vergangene Stunden mit demselben Grund.
 * - `missing`: Die Stunde fehlt ganz (keine Zeile; `null` ist etwas anderes, R14).
 * - `null_values`: Die Stunde ist da, aber Temperatur oder Niederschlag sind `null` (sie machen den Tag
 *   unvollständig, R13/R14).
 * - `stale_prediction`: Für die Stunde gibt es nur eine Vorhersage, ihre Zeit ist vorbei (R08).
 */
export const GAP_REASONS = ['missing', 'null_values', 'stale_prediction'] as const;
export type GapReason = (typeof GAP_REASONS)[number];

export interface Gap {
  /** UTC-Zeitpunkt der ersten Stunde, `YYYY-MM-DDTHH:MM:SSZ`. */
  id: string;
  /** Beginn der ersten Stunde, Berliner Ortszeit mit Offset (`2026-11-12T04:00:00+01:00`). */
  from: string;
  /** Beginn der letzten Stunde, Berliner Ortszeit mit Offset. */
  to: string;
  hours: number;
  reason: GapReason;
}

export interface GapList {
  items: Gap[];
}
