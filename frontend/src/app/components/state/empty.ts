import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NoticeComponent } from '../notice/notice';

/**
 * Leer (E3.7.8, B5.2): Hinweisbox mit Meldung, z. B. „Für November 2024 liegen keine Daten
 * vor. Daten gibt es ab Januar 2025.“ Ein Textlink kommt per Content Projection dazu.
 */
@Component({
  selector: 'app-empty',
  imports: [NoticeComponent],
  templateUrl: './empty.html',
  styleUrl: './state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'state state--empty' },
})
export class EmptyComponent {
  readonly message = input.required<string>();
  readonly kicker = input<string | null>(null);
  /** Nachträgliche Anzeige vorlesen (`role="status"`). */
  readonly announce = input(false);
}
