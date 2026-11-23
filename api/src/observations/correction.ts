import type { CorrectionField } from './correction.entity';
import type { ObservationValues } from './observation';

/** Feld einer Korrektur in der Schreibweise der API (camelCase wie die Observation, 03 B2.2). */
export type CorrectionFieldName = keyof ObservationValues;

/** API-Feld → Spalte der Tabelle `observation` und Wert von `correction.field` (snake_case, `CHK_correction_field`). */
export const CORRECTION_COLUMNS: Readonly<Record<CorrectionFieldName, CorrectionField>> = {
  temperature: 'temperature',
  apparentTemperature: 'apparent_temperature',
  precipitation: 'precipitation',
  weatherCode: 'weather_code',
  windSpeed: 'wind_speed',
  windDirection: 'wind_direction',
};

const FIELD_OF_COLUMN = Object.fromEntries(
  Object.entries(CORRECTION_COLUMNS).map(([field, column]) => [column, field]),
) as Record<CorrectionField, CorrectionFieldName>;

/** `correction.field` (snake_case) → API-Feld (camelCase). */
export function fieldOfColumn(column: CorrectionField): CorrectionFieldName {
  return FIELD_OF_COLUMN[column];
}

/** Ein Eintrag der Korrekturhistorie (03 B2.2 „correction“). Eine Rücknahme hat `revertsCorrectionId` (R33). */
export interface CorrectionResource {
  id: number;
  observationId: number;
  field: CorrectionFieldName;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  correctedBy: number;
  correctedAt: string;
  revertsCorrectionId: number | null;
}

/** `GET /api/observations/:id/corrections`: Historie einer Stunde, nach `correctedAt` absteigend. */
export interface CorrectionHistory {
  items: CorrectionResource[];
}

/** Eintrag der Übersicht `GET /api/corrections` (B2.2 „corrections“): dazu die Ortszeit der Stunde. */
export interface CorrectionListItem {
  id: number;
  observationId: number;
  /** Berliner Ortszeit der korrigierten Stunde mit Offset, z. B. `2026-11-19T14:00:00+01:00`. */
  observationTimeLocal: string;
  field: CorrectionFieldName;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  correctedBy: number;
  correctedAt: string;
  revertsCorrectionId: number | null;
}

/** `GET /api/corrections` (US13-14): eine Seite, nach `correctedAt` absteigend; `meta` wie bei `/imports` (R24). */
export interface CorrectionList {
  items: CorrectionListItem[];
  meta: { page: number; limit: number; total: number };
}

/** Zeile der Tabelle `correction` (snake_case). */
export interface CorrectionRow {
  id: number;
  observation_id: number;
  field: CorrectionField;
  old_value: number | null;
  new_value: number | null;
  reason: string;
  corrected_by: number;
  corrected_at: string;
  reverts_correction_id: number | null;
}

/** Response-Mapper eines Eintrags (feste Reihenfolge wie B2.2). */
export function toCorrectionResource(row: CorrectionRow): CorrectionResource {
  return {
    id: row.id,
    observationId: row.observation_id,
    field: fieldOfColumn(row.field),
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: row.reason,
    correctedBy: row.corrected_by,
    correctedAt: row.corrected_at,
    revertsCorrectionId: row.reverts_correction_id,
  };
}

/** Korrekturen (keine Rücknahmen), die noch nicht zurückgenommen sind. */
function activeCorrections(entries: readonly CorrectionRow[]): CorrectionRow[] {
  const reverted = new Set(entries.map(entry => entry.reverts_correction_id).filter(id => id !== null));
  return entries.filter(entry => entry.reverts_correction_id === null && !reverted.has(entry.id));
}

/**
 * R33: Warum eine Korrektur nicht zurückgenommen werden kann, oder `null`. `entries` = alle Einträge der
 * Stunde, `values` = ihre aktuellen Werte.
 * - Eine Rücknahme selbst wird nicht zurückgenommen.
 * - Schon zurückgenommen (es gibt einen Eintrag mit `revertsCorrectionId = id`; dazu `UNIQUE` in der DB).
 * - Nicht die jüngste noch nicht zurückgenommene Korrektur des Felds.
 * - Das Feld hat nicht mehr den korrigierten Wert (ein Import mit `overwriteCorrections` hat ihn ersetzt, R20).
 */
export function notReversibleReason(
  target: CorrectionRow,
  entries: readonly CorrectionRow[],
  values: ObservationValues,
): string | null {
  if (target.reverts_correction_id !== null) return 'Sie ist selbst eine Rücknahme.';
  const active = activeCorrections(entries);
  if (!active.some(entry => entry.id === target.id)) return 'Sie wurde schon zurückgenommen.';
  if (active.some(entry => entry.field === target.field && entry.id > target.id)) {
    return 'Dasselbe Feld wurde danach noch einmal korrigiert.';
  }
  if (values[fieldOfColumn(target.field)] !== target.new_value) {
    return 'Der Wert wurde inzwischen durch einen Import ersetzt.';
  }
  return null;
}

/**
 * R33: Hat die Stunde noch eine **wirksame** Korrektur? Je Feld zählt die jüngste nicht zurückgenommene
 * Korrektur, und nur, solange das Feld noch ihren neuen Wert hat. Ohne wirksame Korrektur ist
 * `corrected_at = NULL`, und ein Import darf die Stunde wieder aktualisieren (R20).
 */
export function hasEffectiveCorrection(entries: readonly CorrectionRow[], values: ObservationValues): boolean {
  const latest = new Map<CorrectionField, CorrectionRow>();
  for (const entry of activeCorrections(entries)) {
    const previous = latest.get(entry.field);
    if (!previous || entry.id > previous.id) latest.set(entry.field, entry);
  }
  return [...latest.values()].some(entry => values[fieldOfColumn(entry.field)] === entry.new_value);
}
