import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';

export type NoticeVariant = 'info' | 'error' | 'forecast';

const DEFAULT_KICKER: Record<NoticeVariant, string> = {
  info: 'Hinweis',
  error: 'Fehler',
  forecast: 'Vorhersage',
};

/**
 * Hinweisbox (E3.7.7): 4-px-Linie links, Kicker als Überschrift, Text per Content Projection.
 * - `info`: Linie `--color-notice-line`, Fläche `--color-notice-bg`, Kicker „HINWEIS“.
 * - `forecast`: Linie `--color-accent-bright`, Fläche `--color-surface`, Kicker „VORHERSAGE“ + „◔“.
 * - `error`: Linie und Kicker `--color-danger`, Fläche `--color-danger-bg`, Kicker „FEHLER“.
 *
 * `announce`: nur bei nachträglicher Anzeige setzen (Fehler nach einer Aktion, späterer Hinweis).
 * Dann trägt die Box `role="alert"` (Fehler) bzw. `role="status"` (sonst).
 *
 * Ohne View-Kapselung, damit projizierte Absätze ohne eigene Ränder auskommen;
 * alle Selektoren beginnen mit `.notice`.
 */
@Component({
  selector: 'app-notice',
  templateUrl: './notice.html',
  styleUrl: './notice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'notice',
    '[class.notice-info]': 'variant() === "info"',
    '[class.notice-error]': 'variant() === "error"',
    '[class.notice-forecast]': 'variant() === "forecast"',
    '[attr.role]': 'role()',
  },
})
export class NoticeComponent {
  readonly variant = input<NoticeVariant>('info');
  /** Eigener Kicker; Standard je Variante. */
  readonly kicker = input<string | null>(null);
  /** Box erscheint nachträglich und soll vorgelesen werden. */
  readonly announce = input(false);

  readonly kickerText = computed(() => this.kicker() ?? DEFAULT_KICKER[this.variant()]);
  readonly role = computed(() => {
    if (!this.announce()) return null;
    return this.variant() === 'error' ? 'alert' : 'status';
  });
}
