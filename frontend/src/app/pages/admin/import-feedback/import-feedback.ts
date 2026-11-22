import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../components/notice/notice';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import { runningImportIdOf } from '../../../utils/admin-format';

export const IMPORT_RUNNING_MESSAGE =
  'Es läuft bereits ein Import. Ein neuer Import ist erst möglich, wenn dieser fertig ist.';

/** Ergebnis von `POST /api/imports` für die Box über dem Formular (E3.7.7). */
export type ImportFeedback =
  | { type: 'started'; importId: number }
  | { type: 'running'; runningImportId: number | null }
  | { type: 'error'; message: string };

/**
 * Fehler von `POST /api/imports` ohne Feldbezug als Rückmeldung: 409 `IMPORT_RUNNING` (US10-7) mit
 * der Nummer des laufenden Imports, sonst die Meldung der API (der `apiErrorInterceptor` liefert für
 * Netzwerk und 502–504 „Server nicht erreichbar.“). Feldfehler (400 mit `errors[].field`) ordnet die
 * Seite vorher selbst den Feldern zu.
 */
export function importFeedbackFromError(error: unknown): ImportFeedback {
  const apiError = apiErrorOf(error);
  if (apiError.code === 'IMPORT_RUNNING') return { type: 'running', runningImportId: runningImportIdOf(apiError) };
  return { type: 'error', message: apiError.message };
}

/**
 * Rückmeldung nach „Import starten“ bzw. „Nachladen“ (US10, US12-3):
 * - gestartet: Box „ERFOLG – Import #12 gestartet.“ (`role="status"`) mit Link zur Detailseite,
 * - 409 `IMPORT_RUNNING`: Fehlerbox mit verständlicher Meldung und Link auf den laufenden Import,
 * - sonst: Fehlerbox mit der Meldung (`role="alert"`).
 */
@Component({
  selector: 'app-import-feedback',
  imports: [NoticeComponent, RouterLink],
  templateUrl: './import-feedback.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'import-feedback', style: 'display: block' },
})
export class ImportFeedbackComponent {
  readonly feedback = input.required<ImportFeedback>();

  protected readonly runningMessage = IMPORT_RUNNING_MESSAGE;

  /** Nummer des gestarteten bzw. laufenden Imports (`null` = unbekannt). */
  protected readonly importId = computed(() => {
    const f = this.feedback();
    if (f.type === 'started') return f.importId;
    return f.type === 'running' ? f.runningImportId : null;
  });

  protected readonly errorMessage = computed(() => {
    const f = this.feedback();
    return f.type === 'error' ? f.message : '';
  });
}
