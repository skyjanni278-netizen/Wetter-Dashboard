import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SummaryBase } from '../../models/api';
import { KpiCardComponent } from '../kpi-card/kpi-card';

const NBSP = ' ';

/** Eine Kenntag-Karte: Kicker, Zahl und Definition als Zusatzzeile (R27, 02 N05). */
export interface IndicatorCard {
  kicker: string;
  value: number;
  definition: string;
}

/**
 * Kenntage eines Monats oder Jahres (N05, US18): Frost-, Eis-, Sommer-, heiße, Niederschlags- und Trockentage
 * aus `indicators` und `dryDays` der Zusammenfassung, als Kennzahl-Karten unter der h2 „Kenntage“.
 * Gezählt werden nur vollständige Tage (R13, R27); ist der Zeitraum unvollständig, steht das als Hinweis
 * über den Karten („Gezählt sind nur die 18 vollständigen Tage von 30.“). Das Frontend rechnet nichts nach.
 */
@Component({
  selector: 'app-indicator-cards',
  imports: [KpiCardComponent],
  templateUrl: './indicator-cards.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorCardsComponent {
  readonly summary = input.required<SummaryBase>();
  /** Neu laden mit stehen bleibenden Werten (Ladebalken). */
  readonly busy = input(false);
  /** Erster Index für das gestaffelte Einblenden (nach den Karten darüber). */
  readonly revealIndex = input(0);

  /** Hinweis „nur vollständige Tage“, nur bei unvollständigem Zeitraum (R13). */
  readonly hint = computed(() => {
    const s = this.summary();
    if (s.complete) return null;
    if (s.daysComplete === 0) return `Noch kein vollständiger Tag von ${s.daysExpected}; gezählt werden nur vollständige Tage.`;
    if (s.daysComplete === 1) return `Gezählt ist nur 1 vollständiger Tag von ${s.daysExpected}.`;
    return `Gezählt sind nur die ${s.daysComplete} vollständigen Tage von ${s.daysExpected}.`;
  });

  readonly cards = computed<IndicatorCard[]>(() => {
    const s = this.summary();
    const i = s.indicators;
    // Geschütztes Leerzeichen zwischen Zahl und Einheit (kein Umbruch „0 / °C“)
    return [
      { kicker: 'Frosttage', value: i.frostDays, definition: `Tiefstwert unter 0${NBSP}°C` },
      { kicker: 'Eistage', value: i.iceDays, definition: `Höchstwert unter 0${NBSP}°C` },
      { kicker: 'Sommertage', value: i.summerDays, definition: `Höchstwert ab 25${NBSP}°C` },
      { kicker: 'Heiße Tage', value: i.hotDays, definition: `Höchstwert ab 30${NBSP}°C` },
      { kicker: 'Niederschlagstage', value: i.precipitationDays, definition: `ab 0,1${NBSP}mm Niederschlag` },
      { kicker: 'Trockentage', value: s.dryDays, definition: `unter 0,1${NBSP}mm Niederschlag` },
    ];
  });
}
