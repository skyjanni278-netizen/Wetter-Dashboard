import type { Notice, NoticeType } from '../models/api';
import { UNIT_SEPARATOR } from '../pipes/unit.pipe';
import { isValidIsoDate } from './berlin-date';

/** Fester Zusatz jeder Hinweisbox aus der Vorhersage (N07, US20-6): Abgrenzung zu amtlichen Warnungen. */
export const NOTICE_DISCLAIMER = 'Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst';

/** Wortlaut je Art: „Frost möglich …: Tiefstwert …“ (US20-6); Hitze und Starkregen im selben Muster. */
const WORDING: Record<NoticeType, { label: string; value: string }> = {
  frost: { label: 'Frost', value: 'Tiefstwert' },
  heat: { label: 'Hitze', value: 'Höchstwert' },
  heavy_rain: { label: 'Starkregen', value: 'Niederschlag' },
};

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long' });
const ONE_DECIMAL = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** „Samstag, 21.11.“ aus `2026-11-21` (Kalendertag ohne Zeitzone). */
export function noticeDayLabel(date: string): string {
  if (!isValidIsoDate(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAY.format(new Date(Date.UTC(y, m - 1, d)))}, ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

/** „−2,3 °C“: eine Nachkommastelle, echtes Minuszeichen, schmales Leerzeichen vor der Einheit (V11). */
export function noticeValueText(value: number, unit: string): string {
  const text = ONE_DECIMAL.format(Math.abs(value));
  const sign = value < 0 && text !== '0,0' ? '−' : '';
  return `${sign}${text}${UNIT_SEPARATOR}${unit}`;
}

/** „Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C“ (US20-6). */
export function noticeText(notice: Notice): string {
  const wording = WORDING[notice.type];
  return `${wording.label} möglich am ${noticeDayLabel(notice.date)}: ${wording.value} ${noticeValueText(notice.value, notice.unit)}`;
}
