/**
 * Beschriftungen und Formate des Admin-Bereichs (US10–US14, 02 E3.7.5/E3.7.6).
 * Zeiten der API sind UTC (`requestedAt` …) oder Berliner Ortszeit mit Offset (Lücken); angezeigt
 * wird immer Berliner Ortszeit.
 */
import type { ChipVariant } from '../components/chip/chip';
import type { ApiError, GapReason, ImportKind, ImportStatus } from '../models/api';
import { formatDateDe } from './berlin-date';

/** Abstand des Pollings auf der Detailseite (03 B3.5). */
export const IMPORT_POLL_INTERVAL_MS = 2000;

/** Einträge je Seite im Importprotokoll (E3.7.5: ab 20 Zeilen blättern). */
export const IMPORTS_PAGE_SIZE = 20;

/** Status in der Reihenfolge des Filters. */
export const IMPORT_STATUS_VALUES: readonly ImportStatus[] = ['queued', 'running', 'succeeded', 'partial', 'failed'];

/** Chip-Text je Status (E3.7.5: „LÄUFT“, „OK“, „FEHLER“; GROSS per CSS). */
export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  queued: 'Wartet',
  running: 'Läuft',
  succeeded: 'OK',
  partial: 'Mit Warnungen',
  failed: 'Fehler',
};

/** Statusfarbe als Text (E3.7.5): OK grün, Fehler rot, sonst neutral. */
export const IMPORT_STATUS_VARIANT: Record<ImportStatus, ChipVariant> = {
  queued: 'status',
  running: 'status',
  succeeded: 'success',
  partial: 'status',
  failed: 'danger',
};

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  legacy: 'Altdaten',
  range: 'Zeitraum',
  gaps: 'Lücken',
  scheduled: 'Stündlich',
};

export const GAP_REASON_LABEL: Record<GapReason, string> = {
  missing: 'Stunde fehlt',
  null_values: 'Werte leer',
  stale_prediction: 'Veraltete Vorhersage',
};

/** Import noch nicht abgeschlossen (R19): weiter pollen. */
export function isActiveImport(status: ImportStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function isImportStatus(value: unknown): value is ImportStatus {
  return typeof value === 'string' && (IMPORT_STATUS_VALUES as readonly string[]).includes(value);
}

/** `?seite=` (1-basiert): nur ganze Zahlen ab 1, sonst Seite 1. */
export function parsePageParam(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number(value);
}

/** Pfad-Parameter `:id` als positive ganze Zahl oder `null`. */
export function parseImportId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

const BERLIN_DATE_TIME = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** UTC-Zeitpunkt (`2026-11-22T13:05:00Z`) als „22.11.2026, 14:05“ (Berlin); fehlend „–“. */
export function formatDateTimeBerlin(utc: string | null | undefined): string {
  if (!utc) return '–';
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? utc : BERLIN_DATE_TIME.format(date);
}

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

/** Ortszeit mit Offset (`2026-11-12T04:00:00+01:00`) als „12.11.2026, 04:00“, ohne Umrechnung. */
export function formatLocalDateTime(local: string): string {
  const match = LOCAL_DATE_TIME.exec(local);
  return match ? `${formatDateDe(match[1])}, ${match[2]}:${match[3]}` : local;
}

/** Zeitraum eines Imports: „01.10.2026 – 31.10.2026“, ein Tag einmal, ohne Zeitraum „–“. */
export function formatPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return '–';
  return from === to ? formatDateDe(from) : `${formatDateDe(from)} – ${formatDateDe(to)}`;
}

/** `details.runningImportId` aus 409 `IMPORT_RUNNING` (US10-7), sonst `null`. */
export function runningImportIdOf(error: ApiError): number | null {
  if (error.code !== 'IMPORT_RUNNING') return null;
  const id = error.details?.['runningImportId'];
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** „1 Stunde“ / „27 Stunden“. */
export function hoursLabel(hours: number): string {
  return `${hours.toLocaleString('de-DE')} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
}
