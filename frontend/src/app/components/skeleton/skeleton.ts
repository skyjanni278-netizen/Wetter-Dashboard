import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Platzhalter in der Endgröße eines Inhalts (E3.7.8): Fläche `--color-skeleton`, keine
 * Schimmer-Animation, für Screenreader unsichtbar. Den Ladetext liefert `app-loading`.
 */
@Component({
  selector: 'app-skeleton',
  template: '',
  styleUrl: './skeleton.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
})
export class SkeletonComponent {
  /** CSS-Breite, z. B. `60%` oder `8rem`. */
  readonly width = input('100%');
  /** CSS-Höhe, z. B. `1rem` (Textzeile) oder `var(--fs-lg)` (große Zahl). */
  readonly height = input('1rem');
}
