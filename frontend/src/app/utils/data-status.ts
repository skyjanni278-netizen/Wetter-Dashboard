/**
 * Texte zum Datenstand (N01, US16-4/-5, E3.7.7–E3.7.9). Zeitpunkte der API sind UTC, angezeigt wird
 * Berliner Ortszeit. Ob ein Zeitpunkt „heute“ ist, entscheidet `status.today` (Server), nicht die
 * Browser-Uhr.
 */
import type { Status } from '../models/api';
import { berlinToday, formatDateDe } from './berlin-date';

const BERLIN_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Berliner Datum `YYYY-MM-DD` und Uhrzeit `HH:MM` eines UTC-Zeitpunkts; ungültig → `null`. */
export function berlinDateTime(utc: string | null | undefined): { date: string; time: string } | null {
  if (!utc) return null;
  const instant = new Date(utc);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = BERLIN_PARTS.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** „19.11.2026, 11:05 Uhr“; fehlend „–“. */
export function formatUpdateDateTime(utc: string | null | undefined): string {
  const local = berlinDateTime(utc);
  return local ? `${formatDateDe(local.date)}, ${local.time} Uhr` : '–';
}

/** „14:05 Uhr“, wenn der Zeitpunkt auf `today` (Berlin) fällt, sonst „19.11.2026, 11:05 Uhr“. */
export function formatUpdateTime(utc: string | null | undefined, today: string): string {
  const local = berlinDateTime(utc);
  if (!local) return '–';
  return local.date === today ? `${local.time} Uhr` : `${formatDateDe(local.date)}, ${local.time} Uhr`;
}

/**
 * Zeile im Seitenkopf (US16-4): „Stand: 14:05 Uhr“, mit Scheduler zusätzlich „· nächster Abruf 15:05 Uhr“.
 * Ohne erfolgreiche Aktualisierung (`never`): „Stand: noch keine Aktualisierung“.
 */
export function standText(status: Status): string {
  if (!status.lastSuccessfulUpdateAt) return 'Stand: noch keine Aktualisierung';
  const stand = `Stand: ${formatUpdateTime(status.lastSuccessfulUpdateAt, status.today)}`;
  return status.nextScheduledUpdateAt
    ? `${stand} · nächster Abruf ${formatUpdateTime(status.nextScheduledUpdateAt, status.today)}`
    : stand;
}

/**
 * Volle Stunden seit `utc` nach der Uhr `now`, aber nur, wenn diese Uhr zum Server passt: Der Berliner Tag
 * von `now` muss `status.today` sein und `now` darf nicht vor dem Zeitpunkt liegen. Sonst `null` (z. B. bei
 * `FAKE_NOW` am Server oder falsch gestellter Browser-Uhr), dann entfällt die Zahl im Text.
 * Die API liefert keine Serverzeit, nur den Tag (`status.today`).
 */
export function hoursSince(utc: string, status: Pick<Status, 'today'>, now: Date = new Date()): number | null {
  const since = new Date(utc).getTime();
  if (Number.isNaN(since) || berlinToday(now) !== status.today || now.getTime() < since) return null;
  return Math.floor((now.getTime() - since) / 3_600_000);
}

/**
 * Text der Hinweisbox bei `updateState = "delayed"` (US16-5, E3.7.8):
 * „Stand: 19.11.2026, 11:05 Uhr – seit 3 Stunden keine Aktualisierung“. Passt die Browser-Uhr nicht zum
 * Server (siehe `hoursSince`), ohne Zahl: „… – seitdem keine Aktualisierung“.
 */
export function delayedText(status: Status, now: Date = new Date()): string {
  const last = status.lastSuccessfulUpdateAt;
  if (!last) return neverText(status);
  const hours = hoursSince(last, status, now);
  const since = hours === null
    ? 'seitdem keine Aktualisierung'
    : `seit ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'} keine Aktualisierung`;
  return `Stand: ${formatUpdateDateTime(last)} – ${since}`;
}

/** Text der Hinweisbox bei `updateState = "never"`: noch keine Aktualisierung, ggf. mit dem letzten Datentag. */
export function neverText(status: Pick<Status, 'dataTo'>): string {
  return status.dataTo
    ? `Die Daten wurden noch nie automatisch aktualisiert. Gespeichert sind Daten bis ${formatDateDe(status.dataTo)}.`
    : 'Die Daten wurden noch nie automatisch aktualisiert.';
}

/** Footer (E3.7.9): „Zuletzt aktualisiert: 19.11.2026, 14:05 Uhr“ bzw. „Noch keine Aktualisierung“. */
export function footerUpdateText(status: Status): string {
  return status.lastSuccessfulUpdateAt
    ? `Zuletzt aktualisiert: ${formatUpdateDateTime(status.lastSuccessfulUpdateAt)}`
    : 'Noch keine Aktualisierung';
}
