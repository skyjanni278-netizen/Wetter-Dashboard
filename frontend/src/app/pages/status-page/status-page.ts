import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataStatusService } from '../../services/data-status.service';
import { AuthService } from '../../services/auth.service';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card';
import { ChipComponent, ChipVariant } from '../../components/chip/chip';
import { LoadingComponent } from '../../components/state/loading';
import { ErrorComponent } from '../../components/state/error';
import { UpdateNoticeComponent } from '../../components/update-notice/update-notice';
import type { UpdateState } from '../../models/api';
import { formatDateDe } from '../../utils/berlin-date';
import { berlinDateTime, formatUpdateDateTime } from '../../utils/data-status';

/** Eigene Meldung ohne Text des Backends (US17-4: kein Fehlertext für Gäste). */
export const DATA_STATUS_ERROR_MESSAGE = 'Der Datenstand konnte nicht geladen werden.';

/** Chip an „Zuletzt aktualisiert“ (R25); die Bedeutung trägt das Wort, die Farbe ist nur Zusatz. */
const UPDATE_CHIP: Record<UpdateState, { label: string; variant: ChipVariant }> = {
  ok: { label: 'Aktuell', variant: 'success' },
  delayed: { label: 'Verzögert', variant: 'status' },
  never: { label: 'Noch nie', variant: 'status' },
};

/**
 * Datenstand für Gäste `/status` (N04, US17-4/-5, 02 E3.9 „Neu: Status“): h1 „Datenstand“, Kennzahl-Karten
 * „Zuletzt aktualisiert“, „Tage mit Daten“, „Vollständige Tage“, „Lücken“ und der Zeitraum, alles aus
 * `GET /api/status`. Keine Importtabelle, keine Lückenliste und kein Fehlertext des Backends; bei
 * `delayed`/`never` die Hinweisbox wie auf „Heute“. Angemeldete Admins sehen zusätzlich den Link
 * „Importprotokoll ansehen →“ auf `/admin/importe`.
 *
 * Die Seite lädt `/api/status` beim Aufruf neu (`DataStatusService.refresh()`), damit sie nicht den Stand vom
 * App-Start zeigt; Footer und Seitenkopf bekommen den neuen Stand mit.
 */
@Component({
  selector: 'app-data-status-page',
  imports: [RouterLink, KpiCardComponent, ChipComponent, LoadingComponent, ErrorComponent, UpdateNoticeComponent],
  templateUrl: './status-page.html',
  styleUrl: './status-page.css',
})
export class DataStatusPageComponent {
  private dataStatus = inject(DataStatusService);
  readonly loggedIn = inject(AuthService).isLoggedIn;

  readonly errorMessage = DATA_STATUS_ERROR_MESSAGE;
  readonly skeletonKickers = ['Zuletzt aktualisiert', 'Tage mit Daten', 'Vollständige Tage', 'Lücken'];

  readonly state = this.dataStatus.state;
  /** Anzeige nur ohne Fehler; bei einem Fehler entfallen alte Werte (B5.2). */
  readonly status = computed(() => (this.state() === 'error' ? null : this.dataStatus.status()));
  readonly loading = computed(() => this.state() === 'loading');

  readonly updateChip = computed(() => {
    const status = this.status();
    return status ? UPDATE_CHIP[status.updateState] ?? UPDATE_CHIP.never : null;
  });

  /** „Zuletzt aktualisiert“: Uhrzeit als Wert, Datum in der Zusatzzeile. */
  readonly lastUpdate = computed(() => berlinDateTime(this.status()?.lastSuccessfulUpdateAt));
  readonly lastUpdateMeta = computed(() => {
    const last = this.lastUpdate();
    return last ? `am ${formatDateDe(last.date)}` : 'Noch keine Aktualisierung';
  });
  readonly nextUpdate = computed(() => {
    const next = this.status()?.nextScheduledUpdateAt;
    return next ? formatUpdateDateTime(next) : null;
  });

  /** Zeitraum mit Daten: „01.01.2025 – 19.11.2026“; ohne Daten `null`. */
  readonly period = computed(() => {
    const status = this.status();
    return status?.dataFrom && status.dataTo ? `${formatDateDe(status.dataFrom)} – ${formatDateDe(status.dataTo)}` : null;
  });

  readonly completeMeta = computed(() => {
    const status = this.status();
    if (!status) return null;
    return `von ${status.daysWithData.toLocaleString('de-DE')} ${status.daysWithData === 1 ? 'Tag' : 'Tagen'} mit Daten`;
  });

  readonly gapMeta = computed(() => {
    const count = this.status()?.gapCount ?? 0;
    return count === 0 ? 'keine fehlenden oder leeren Stunden' : 'Zeiträume mit fehlenden oder leeren Stunden';
  });

  constructor() {
    this.dataStatus.refresh();
  }

  retry(): void {
    this.dataStatus.refresh();
  }
}
