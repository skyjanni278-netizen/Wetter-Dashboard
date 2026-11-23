import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Schalter-Chip (E3.7.6, N06): `<button aria-pressed>` in Chip-Form, z. B. „Vorjahr vergleichen“.
 *
 * - Text per Content Projection, Darstellung GROSS per CSS; aktiv mit Fläche `--color-text` und Häkchen „✓“.
 * - `disabled`: `aria-disabled="true"` statt `disabled` (bleibt fokussierbar, der Grund daneben bleibt lesbar),
 *   gestrichelter Rand; ein Klick ändert nichts. Deaktiviert gilt der Chip als nicht gedrückt.
 * - `describedBy`: Id des Hinweistexts neben dem Chip (z. B. „Kein Vorjahr mit Daten“).
 * - Der Chip hält keinen eigenen Zustand: `pressedChange` meldet den gewünschten neuen Wert, die Seite
 *   schreibt ihn in die URL.
 */
@Component({
  selector: 'app-toggle-chip',
  templateUrl: './toggle-chip.html',
  styleUrl: './toggle-chip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleChipComponent {
  readonly pressed = input(false);
  readonly disabled = input(false);
  readonly describedBy = input<string | null>(null);
  /** Neuer gewünschter Zustand nach einem Klick (nicht bei `disabled`). */
  readonly pressedChange = output<boolean>();

  readonly active = computed(() => this.pressed() && !this.disabled());

  toggle(): void {
    if (this.disabled()) return;
    this.pressedChange.emit(!this.active());
  }
}
