import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const SITE_TITLE = 'Wetter Heubach';

const MONTH_LONG = [
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

/** „19. November 2026“ aus YYYY-MM-DD */
export function longDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(d, 10)}. ${MONTH_LONG[parseInt(m, 10) - 1]} ${y}`;
}

/** „November 2026“ aus Jahr und Monat (jeweils als Text oder Zahl) */
export function monthLabel(year: string | number, month: string | number): string {
  return `${MONTH_LONG[parseInt(String(month), 10) - 1]} ${year}`;
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
