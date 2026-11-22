import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipVariant = 'status' | 'forecast' | 'success' | 'danger';

/**
 * Nicht klickbarer Chip (E3.7.6), Text per Content Projection, Darstellung GROSS per CSS.
 * - `status`: „Unvollständig“, „18 von 30 Tagen“, „Korrigiert“.
 * - `forecast`: Rand `--color-accent-bright`, Text `--color-accent-strong`, Symbol „◔“
 *   (`aria-hidden`). Ohne Inhalt lautet der Text „Vorhersage“.
 * - `success` / `danger`: Status eines Imports (E3.7.5, „OK“ / „Fehler“) mit Statusfarbe als **Text**;
 *   der Text trägt die Bedeutung, die Farbe ist nur Zusatz.
 */
@Component({
  selector: 'app-chip',
  templateUrl: './chip.html',
  styleUrl: './chip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chip',
    '[class.chip-forecast]': 'variant() === "forecast"',
    '[class.chip-success]': 'variant() === "success"',
    '[class.chip-danger]': 'variant() === "danger"',
  },
})
export class ChipComponent {
  readonly variant = input<ChipVariant>('status');
}
