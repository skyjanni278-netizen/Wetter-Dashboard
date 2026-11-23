/**
 * Korrekturen (N03, R16, R33): Felder, Prüfung im Browser, Formate und Rücknehmbarkeit.
 * Die Meldungen entsprechen denen der API (`ObservationPatchSchema`), damit Client- und Serverfehler am Feld
 * gleich lauten. Der Server prüft trotzdem selbst (Sicherheit liegt im Backend).
 */
import type { CorrectionField, CorrectionResource, ObservationResource } from '../models/api';
import { describeWeather } from './weather-icon';

/** Länge der Begründung (03 B2.6, `ReasonSchema`). */
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

export const REASON_REQUIRED_MESSAGE = 'Bitte einen Grund angeben.';
export const REASON_TOO_SHORT_MESSAGE = `Der Grund muss mindestens ${REASON_MIN_LENGTH} Zeichen lang sein.`;
export const REASON_TOO_LONG_MESSAGE = `Der Grund darf höchstens ${REASON_MAX_LENGTH} Zeichen lang sein.`;
export const NO_CHANGE_MESSAGE = 'Bitte mindestens einen Wert ändern.';
export const ONE_DECIMAL_MESSAGE = 'Höchstens eine Nachkommastelle.';

/** Meldungen der API, die die Seite selbst formuliert (B5.2). */
export const CONFLICT_MESSAGE = 'Der Wert wurde inzwischen geändert. Neu laden?';
export const PREDICTION_MESSAGE = 'Diese Stunde ist eine Vorhersage und kann nicht korrigiert werden.';
export const NOT_REVERSIBLE_MESSAGE =
  'Diese Korrektur kann nicht zurückgenommen werden: Sie wurde schon zurückgenommen, ist selbst eine Rücknahme, ' +
  'es gibt eine neuere Korrektur desselben Werts oder ein Import hat den Wert inzwischen ersetzt.';
export const MISSING_ETAG_MESSAGE = 'Die Version der Stunde fehlt. Bitte neu laden.';

/** Ein korrigierbares Feld (R16) mit Wertebereich; `subject` für die Meldung („Die Temperatur muss …“). */
export interface CorrectionFieldSpec {
  field: CorrectionField;
  label: string;
  subject: string;
  unit: string;
  min: number;
  max: number;
  /** Ganze Zahl (Windrichtung, Wettercode); sonst höchstens eine Nachkommastelle. */
  integer: boolean;
}

/** Die sechs Felder in der Reihenfolge des Formulars (02 N03, 03 R16). */
export const CORRECTION_FIELDS: readonly CorrectionFieldSpec[] = [
  { field: 'temperature', label: 'Temperatur', subject: 'Die Temperatur', unit: '°C', min: -50, max: 50, integer: false },
  { field: 'apparentTemperature', label: 'Gefühlte Temperatur', subject: 'Die gefühlte Temperatur', unit: '°C', min: -70, max: 60, integer: false },
  { field: 'precipitation', label: 'Niederschlag', subject: 'Der Niederschlag', unit: 'mm', min: 0, max: 200, integer: false },
  { field: 'weatherCode', label: 'Wetter', subject: 'Der Wettercode', unit: '', min: 0, max: 99, integer: true },
  { field: 'windSpeed', label: 'Windgeschwindigkeit', subject: 'Die Windgeschwindigkeit', unit: 'km/h', min: 0, max: 300, integer: false },
  { field: 'windDirection', label: 'Windrichtung', subject: 'Die Windrichtung', unit: '°', min: 0, max: 360, integer: true },
];

export const CORRECTION_FIELD_LABEL: Record<CorrectionField, string> = Object.fromEntries(
  CORRECTION_FIELDS.map(spec => [spec.field, spec.label]),
) as Record<CorrectionField, string>;

function specOf(field: CorrectionField): CorrectionFieldSpec {
  return CORRECTION_FIELDS.find(spec => spec.field === field)!;
}

/** Messwerte mit einer Nachkommastelle („8,0 °C“), ungerundete Altwerte mit bis zu zwei; ganze Zahlen ohne. */
const DECIMAL_FORMAT = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const INTEGER_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** Wert eines Felds für die Anzeige: „9,6 °C“, „61 (Regen)“, „232°“; `null` = „unbekannt“. */
export function formatCorrectionValue(field: CorrectionField, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unbekannt';
  if (field === 'weatherCode') return `${value} (${describeWeather(value)})`;
  const spec = specOf(field);
  const number = (spec.integer ? INTEGER_FORMAT : DECIMAL_FORMAT).format(value);
  return spec.unit === '°' ? `${number}°` : `${number} ${spec.unit}`;
}

/** Vorbelegung eines Eingabefelds: Zahl mit Komma („19,6“), `null` = leer. */
export function inputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

export type ParsedValue = { value: number | null; error: null } | { value: null; error: string };

const NUMBER_INPUT = /^[-−]?\d+(?:[.,]\d+)?$/;

/**
 * Eingabe eines Felds nach R16 prüfen: leer = `null` („unbekannt“), Komma oder Punkt als Dezimaltrenner,
 * Grenzen wie die API, höchstens eine Nachkommastelle bzw. ganze Zahl.
 */
export function parseCorrectionValue(field: CorrectionField, raw: string): ParsedValue {
  const text = raw.trim();
  if (text === '') return { value: null, error: null };
  const spec = specOf(field);
  if (!NUMBER_INPUT.test(text)) return { value: null, error: `${spec.subject} muss eine Zahl sein.` };
  const normalized = text.replace('−', '-').replace(',', '.');
  const value = Number(normalized);
  const decimals = normalized.includes('.') ? normalized.split('.')[1].length : 0;
  if (spec.integer && decimals > 0) {
    return { value: null, error: `${spec.subject} muss eine ganze Zahl sein.` };
  }
  if (value < spec.min || value > spec.max) {
    const min = String(spec.min).replace('-', '−');
    const unit = spec.unit === '°' ? '°' : ` ${spec.unit}`;
    return { value: null, error: `${spec.subject} muss zwischen ${min} und ${spec.max}${unit} liegen.` };
  }
  if (decimals > 1) return { value: null, error: ONE_DECIMAL_MESSAGE };
  return { value, error: null };
}

/** Grund prüfen (3–500 Zeichen ohne Leerzeichen am Rand); `null` = in Ordnung. */
export function reasonError(reason: string): string | null {
  const text = reason.trim();
  if (text === '') return REASON_REQUIRED_MESSAGE;
  if (text.length < REASON_MIN_LENGTH) return REASON_TOO_SHORT_MESSAGE;
  if (text.length > REASON_MAX_LENGTH) return REASON_TOO_LONG_MESSAGE;
  return null;
}

/** Gleicher Wert (beide `null` oder bis auf Rundungsrauschen gleich). */
export function sameValue(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}

/** Neueste zuerst wie die API (`correctedAt`, dann `id` absteigend). */
function newestFirst(items: readonly CorrectionResource[]): CorrectionResource[] {
  return [...items].sort((a, b) => b.correctedAt.localeCompare(a.correctedAt) || b.id - a.id);
}

/**
 * Einträge, die der Browser als rücknehmbar anbietet (R33): keine Rücknahme selbst, nicht schon zurückgenommen,
 * je Feld nur die jüngste noch nicht zurückgenommene Korrektur, und das Feld hat noch ihren neuen Wert (sonst
 * hat ein Import mit `overwriteCorrections` ihn ersetzt). Der Server entscheidet endgültig (409).
 */
export function reversibleCorrectionIds(
  items: readonly CorrectionResource[], observation: ObservationResource | null,
): Set<number> {
  const reversed = new Set(items.map(item => item.revertsCorrectionId).filter((id): id is number => id !== null));
  const seen = new Set<CorrectionField>();
  const result = new Set<number>();
  for (const item of newestFirst(items)) {
    if (item.revertsCorrectionId !== null || reversed.has(item.id) || seen.has(item.field)) continue;
    seen.add(item.field);
    if (observation && !sameValue(observation[item.field], item.newValue)) continue;
    result.add(item.id);
  }
  return result;
}

/** „Stunde 14:00“ aus einer Ortszeit mit oder ohne Offset (`2026-11-19T14:00:00+01:00`). */
export function hourLabel(timeLocal: string): string {
  return `${timeLocal.slice(11, 16)} Uhr`;
}
