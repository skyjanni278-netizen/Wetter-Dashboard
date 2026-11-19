import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SkeletonComponent } from '../skeleton/skeleton';

/**
 * Erstes Laden (E3.7.8, B5.2): Skelett in der Endgröße und ein für Screenreader
 * hörbarer Text per `aria-live="polite"`. Keine Zahl „0“, keine Schimmer-Animation.
 * Eigene Skelette per Content Projection; ohne Inhalt erscheint ein Block von 8 rem.
 */
@Component({
  selector: 'app-loading',
  imports: [SkeletonComponent],
  templateUrl: './loading.html',
  styleUrl: './state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'state state--loading' },
})
export class LoadingComponent {
  readonly label = input('Daten werden geladen');
}
