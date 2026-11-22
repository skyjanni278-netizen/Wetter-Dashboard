import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { parseImportId } from './admin-format';
import { isValidIsoDate } from './berlin-date';
import { isValidMonthParam, isValidYearParam } from './route-params';

export const SITE_TITLE = 'Wetter Heubach';

export const MONTH_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** „November 2026 – Monat“: Zeitraum und Ansicht, ohne Seitenname. */
export function viewTitle(view: string, period?: string | null): string {
  return period ? `${period} – ${view}` : view;
}

/** Hängt den Seitennamen an: „November 2026 – Monat – Wetter Heubach“. */
export function fullTitle(viewPart: string): string {
  return viewPart ? `${viewPart} – ${SITE_TITLE}` : SITE_TITLE;
}

/** „19. November 2026“ aus YYYY-MM-DD; bei ungültigem Datum ein leerer Text (kein „NaN. undefined“). */
export function longDateLabel(isoDate: string | null | undefined): string {
  if (!isValidIsoDate(isoDate)) return '';
  const [y, m, d] = isoDate!.split('-');
  return `${parseInt(d, 10)}. ${MONTH_LONG[parseInt(m, 10) - 1]} ${y}`;
}

/** „November 2026“ aus Jahr und Monat (jeweils als Text oder Zahl); bei ungültigem Monat ein leerer Text. */
export function monthLabel(year: string | number, month: string | number): string {
  const name = MONTH_LONG[parseInt(String(month), 10) - 1];
  return name ? `${name} ${year}` : '';
}

/** Tagesansicht: „10. November 2026 – Heute“, bei ungültigem Datum „Ungültiges Datum“. */
export function dayViewTitle(date: string | null | undefined): string {
  return isValidIsoDate(date) ? viewTitle('Heute', longDateLabel(date)) : 'Ungültiges Datum';
}

/** Monatsansicht: „März 2025 – Monat“, bei ungültigen Parametern „Ungültiger Monat“. */
export function monthViewTitle(year: string | null | undefined, month: string | null | undefined): string {
  return isValidYearParam(year) && isValidMonthParam(month)
    ? viewTitle('Monat', monthLabel(year!, month!))
    : 'Ungültiger Monat';
}

/** Jahresansicht: „2025 – Jahr“, bei ungültigem Jahr „Ungültiges Jahr“. */
export function yearViewTitle(year: string | null | undefined): string {
  return isValidYearParam(year) ? viewTitle('Jahr', year) : 'Ungültiges Jahr';
}

/** Admin-Bereich: „Importe – Admin“ (Muster „<Seite> – <Bereich>“ wie „November 2026 – Monat“). */
export function adminViewTitle(page: string): string {
  return viewTitle('Admin', page);
}

/** Detailseite eines Imports: „Import #12 – Admin“, bei ungültiger Nummer „Ungültiger Import – Admin“. */
export function importDetailTitle(id: string | null | undefined): string {
  return adminViewTitle(parseImportId(id) === null ? 'Ungültiger Import' : `Import #${id}`);
}

/** Setzt den Titel für Heute-, Monats- und Jahresansicht, wenn sich die Auswahl ändert. */
export function setPageTitle(title: Title, view: string, period?: string | null): void {
  title.setTitle(fullTitle(viewTitle(view, period)));
}

/** Nimmt den `title` der Route und hängt den Seitennamen an. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(fullTitle(this.buildTitle(snapshot) ?? ''));
  }
}
