import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NoticeComponent } from '../notice/notice';
import type { Status } from '../../models/api';
import { delayedText, neverText } from '../../utils/data-status';

/**
 * Hinweisbox zum Datenstand (N01, US16-5, E3.7.7/E3.7.8) im Hinweisstil (Linie links, nicht Fehlerrot):
 * - `delayed`: „Stand: 19.11.2026, 11:05 Uhr – seit 3 Stunden keine Aktualisierung“, Kicker „Hinweis“,
 * - `never`: eigener Text „Die Daten wurden noch nie automatisch aktualisiert. …“, Kicker „Datenstand“,
 * - `ok`: nichts (die Seite blendet die Komponente dann am besten ganz aus, damit kein leerer Rasterplatz entsteht).
 * Die Daten der Seite bleiben darunter stehen. `role="status"` nur mit `announce` (nachträgliche Anzeige).
 */
@Component({
  selector: 'app-update-notice',
  imports: [NoticeComponent],
  template: `
    @if (text(); as message) {
      <app-notice variant="info" [kicker]="kicker()" [announce]="announce()">
        <p class="update-notice-text">{{ message }}</p>
      </app-notice>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'update-notice', style: 'display: block' },
})
export class UpdateNoticeComponent {
  readonly status = input.required<Status>();
  /** Uhr für „seit … Stunden“ (Specs); ohne Angabe die Browser-Uhr. */
  readonly now = input<Date | null>(null);
  readonly announce = input(false);

  readonly text = computed(() => {
    const status = this.status();
    if (status.updateState === 'delayed') return delayedText(status, this.now() ?? new Date());
    if (status.updateState === 'never') return neverText(status);
    return null;
  });

  readonly kicker = computed(() => (this.status().updateState === 'never' ? 'Datenstand' : null));
}
