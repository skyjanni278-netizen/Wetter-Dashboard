import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NoticeComponent } from '../notice/notice';

/**
 * Fehler (E3.7.8, B5.2): Fehlerbox mit Kicker „FEHLER“, Meldung, optional Feldfehler
 * (`details`) und Primärbutton „Erneut versuchen“. Die Seite entfernt alte Daten (F03, F12).
 * Weitere Inhalte (z. B. Link zum Datenbeginn) per Content Projection.
 */
@Component({
  selector: 'app-error',
  imports: [NoticeComponent],
  templateUrl: './error.html',
  styleUrl: './state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'state state--error' },
})
export class ErrorComponent {
  readonly message = input.required<string>();
  /** Feldfehler oder weitere Gründe, je ein Listenpunkt. */
  readonly details = input<readonly string[]>([]);
  /** Button „Erneut versuchen“ anzeigen. */
  readonly retryable = input(true);
  readonly retryLabel = input('Erneut versuchen');
  /** Fehler nach einer Aktion: `role="alert"` (Standard). */
  readonly announce = input(true);

  /** Klick auf „Erneut versuchen“. */
  readonly retry = output<void>();
}
