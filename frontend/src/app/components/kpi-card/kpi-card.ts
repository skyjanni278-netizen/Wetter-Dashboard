import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardComponent } from '../card/card';
import { SkeletonComponent } from '../skeleton/skeleton';

/**
 * Kennzahl-Karte (E3.7.4): Kicker (`--color-accent-strong`), große Zahl in Space Grotesk
 * `--fs-lg`, Einheit kleiner in `--color-text-muted`, optionale Zusatzzeile
 * (`meta` und/oder projizierter Inhalt, z. B. `<app-chip variant="forecast" />`).
 *
 * - Zahlen werden erst hier gerundet und deutsch formatiert (`digits` Nachkommastellen).
 * - `null`/`undefined`/`NaN`: Wert „–“, Zusatzzeile „keine Daten“ (falls kein `meta`).
 * - `loading`: Skelett statt Wert (keine „0“), Karte ohne Hover, nicht interaktiv.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [CardComponent, SkeletonComponent],
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiCardComponent {
  readonly kicker = input.required<string>();
  readonly value = input<number | string | null | undefined>(null);
  readonly unit = input<string | null>(null);
  /** Nachkommastellen für Zahlen (fest, damit Spalten nicht springen). */
  readonly digits = input(1);
  /** Zusatzzeile in `--color-text-subtle`. */
  readonly meta = input<string | null>(null);
  /** Erstes Laden: Skelett in Endgröße. */
  readonly loading = input(false);
  /** Neu laden mit stehen bleibendem Wert (Ladebalken, `aria-busy`). */
  readonly busy = input(false);
  readonly reveal = input(false);
  readonly revealIndex = input(0);

  readonly hasValue = computed(() => {
    const v = this.value();
    if (v === null || v === undefined || v === '') return false;
    return typeof v === 'string' || Number.isFinite(v);
  });

  readonly displayValue = computed(() => {
    const v = this.value();
    if (!this.hasValue()) return '–';
    if (typeof v === 'number') {
      const digits = this.digits();
      return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    return String(v);
  });

  readonly metaText = computed(() => this.meta() ?? (this.hasValue() ? null : 'keine Daten'));
}
