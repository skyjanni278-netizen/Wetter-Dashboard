import type { ValueTransformer } from 'typeorm';
import { formatUtc } from '../common/utc';

/** Speicherformat aller Zeitpunkte (03 B2.5): `TEXT` `YYYY-MM-DDTHH:MM:SSZ`, sortierbar als Text. */
export const UTC_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Transformer für Zeitspalten (03 B2.5): schreibt immer UTC-Text ohne Millisekunden, liest ihn unverändert.
 * Der TypeORM-Typ `datetime` wird bewusst nicht verwendet (keine Umrechnung in die Zeitzone des Rechners).
 * Rohes SQL (Upsert) umgeht den Transformer; dort kommen die Werte schon über `formatUtc`.
 */
export const utcTransformer: ValueTransformer = {
  to(value: string | Date | null | undefined): string | null | undefined {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' && UTC_TEXT.test(value)) return value;
    const instant = value instanceof Date ? value : new Date(value);
    return formatUtc(instant);
  },
  from(value: string | null): string | null {
    return value;
  },
};
