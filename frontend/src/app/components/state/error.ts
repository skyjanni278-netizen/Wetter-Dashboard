import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../notice/notice';
import type { ApiError } from '../../models/api';
import { formatDateDe, isValidIsoDate } from '../../utils/berlin-date';

/** Meldung, wenn weder `message` noch `apiError` gesetzt ist. */
export const DEFAULT_ERROR_MESSAGE = 'Fehler beim Laden.';

/**
 * Fehler (E3.7.8, B5.2): Fehlerbox mit Kicker „FEHLER“, Meldung, optional Feldfehler
 * (`details`) und Primärbutton „Erneut versuchen“. Die Seite entfernt alte Daten (F03, F12).
 * Mit `apiError` (B3.3) zeigt sie dessen `message`; bei `code = "NO_DATA"` zusätzlich den Link
 * zum Datenbeginn (`details.dataFrom` → `/tag/<dataFrom>`). Weitere Inhalte per Content Projection.
 */
@Component({
  selector: 'app-error',
  imports: [NoticeComponent, RouterLink],
  templateUrl: './error.html',
  styleUrl: './state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'state state--error' },
})
export class ErrorComponent {
  /** Eigene Meldung; hat Vorrang vor `apiError.message`. */
  readonly message = input<string | null>(null);
  /** Fehler der API (vom `apiErrorInterceptor` übersetzt). */
  readonly apiError = input<ApiError | null>(null);
  /** Feldfehler oder weitere Gründe, je ein Listenpunkt. */
  readonly details = input<readonly string[]>([]);
  /** Button „Erneut versuchen“ anzeigen. */
  readonly retryable = input(true);
  readonly retryLabel = input('Erneut versuchen');
  /** Fehler nach einer Aktion: `role="alert"` (Standard). */
  readonly announce = input(true);

  /** Klick auf „Erneut versuchen“. */
  readonly retry = output<void>();

  protected readonly text = computed(() => this.message() ?? this.apiError()?.message ?? DEFAULT_ERROR_MESSAGE);

  /** Erster Tag mit Daten bei `NO_DATA` (R03), sonst `null`. */
  protected readonly dataFrom = computed(() => {
    const error = this.apiError();
    if (error?.code !== 'NO_DATA') return null;
    const value = error.details?.['dataFrom'];
    return typeof value === 'string' && isValidIsoDate(value) ? value : null;
  });

  protected readonly formatDateDe = formatDateDe;
}
