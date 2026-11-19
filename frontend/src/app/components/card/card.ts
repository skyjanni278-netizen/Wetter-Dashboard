import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Grundkarte (E3.7.4): Fläche `--color-surface`, 1-px-Rand, oben die 6-px-Kante
 * `--color-accent-bright` (Deko), Radius 8 px, kein Schatten. Inhalt per Content Projection.
 *
 * - `busy`: Wechsel der Auswahl (E3.7.8). Alte Inhalte bleiben stehen, die Karte trägt
 *   `aria-busy="true"` und zeigt einen 2-px-Ladebalken direkt unter der Kante.
 * - `reveal` / `revealIndex`: Einblenden beim ersten Aufbau (E3.6), gestaffelt bis Stufe 5.
 *   Bei `prefers-reduced-motion` ohne Animation (tokens.css).
 * - Mit `class="surface-dark"` am Element entsteht die dunkle Hero-Karte.
 */
@Component({
  selector: 'app-card',
  templateUrl: './card.html',
  styleUrl: './card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'card',
    '[class.card-no-edge]': '!edge()',
    '[class.reveal]': 'reveal()',
    '[style.--reveal-index]': 'reveal() ? revealIndex() : null',
    '[attr.aria-busy]': 'busy() ? "true" : null',
  },
})
export class CardComponent {
  /** 6-px-Akzentkante oben (Standard: an). */
  readonly edge = input(true);
  /** Inhalt wird neu geladen: `aria-busy` und Ladebalken. */
  readonly busy = input(false);
  /** Einblenden beim ersten Aufbau (E3.6). */
  readonly reveal = input(false);
  /** Staffelung 0–5 (je 80 ms). */
  readonly revealIndex = input(0);
}
