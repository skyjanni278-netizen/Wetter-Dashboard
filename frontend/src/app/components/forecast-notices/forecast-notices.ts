import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NoticeComponent } from '../notice/notice';
import type { Notice } from '../../models/api';
import { NOTICE_DISCLAIMER, noticeText } from '../../utils/forecast-notice';

/**
 * Hinweise aus der Vorhersage (N07, US20-6, E3.7.7) über der 7-Tage-Vorschau: Hinweisbox im Hinweisstil
 * (Variante `info`: Kicker „HINWEIS“, Linie links, **nicht** Fehlerrot), je Hinweis eine Zeile wie
 * „Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C“ und immer der feste Text
 * „Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst“. Ohne Hinweise erscheint nichts.
 */
@Component({
  selector: 'app-forecast-notices',
  imports: [NoticeComponent],
  template: `
    @if (lines().length > 0) {
      <app-notice variant="info">
        @for (line of lines(); track line.id) {
          <p class="forecast-notice-line">{{ line.text }}</p>
        }
        <p class="forecast-notice-disclaimer">{{ disclaimer }}</p>
      </app-notice>
    }
  `,
  styles: `
    .forecast-notice-line { font-weight: var(--fw-semibold); }
    .forecast-notice-disclaimer { color: var(--color-text-muted); font-size: var(--fs-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'forecast-notices', style: 'display: block' },
})
export class ForecastNoticesComponent {
  /** Hinweise aus `GET /api/notices` (`items`), nach Datum sortiert vom Server. */
  readonly notices = input.required<Notice[]>();

  readonly disclaimer = NOTICE_DISCLAIMER;
  readonly lines = computed(() => this.notices().map(n => ({ id: n.id, text: noticeText(n) })));
}
