import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChipComponent, ChipVariant } from '../chip/chip';

export interface DataTableColumn {
  /** Schlüssel in der Zeile. */
  key: string;
  /** Spaltenkopf; die Darstellung GROSS kommt aus dem CSS. */
  label: string;
  /** `end` für Zahlen: rechtsbündig mit `tabular-nums`. */
  align?: 'start' | 'end';
  /** Zelle als `<th scope="row">` (z. B. Stunde, Tag, Monat). */
  rowHeader?: boolean;
}

/** Zelle mit Chip, z. B. `{ chip: 'Vorhersage', variant: 'forecast' }`. */
export interface DataTableChip {
  chip: string;
  variant?: ChipVariant;
}

/** Zelle mit Symbol () und sichtbarem Text, z. B. . */
export interface DataTableIcon {
  icon: string;
  text: string;
}

/** Zelle mit Textlink (Router), z. B. `{ link: ['/admin/importe', 12], text: '#12', label: 'Import 12 ansehen' }`. */
export interface DataTableLink {
  link: string | readonly (string | number)[];
  text: string;
  /** Zugänglicher Name, wenn der sichtbare Text allein nicht reicht (`aria-label`). */
  label?: string;
}

export type DataTableValue = string | number | null | undefined | DataTableChip | DataTableIcon | DataTableLink;
export type DataTableRow = Readonly<Record<string, DataTableValue>>;

/**
 * Tabelle (E3.7.5): `<caption>`, Spaltenköpfe `<th scope="col">` in Inter 600 GROSS mit
 * 2-px-Linie, Zeilen mit 1-px-Linien, Hover-Zeile `--color-surface-muted`.
 * Werte formatiert die aufrufende Stelle (Rundung erst bei der Ausgabe); Zahlen ohne
 * Formatierung erscheinen deutsch, fehlende Werte als „–“.
 * Mit `columnsNarrow` gilt unter 48em (768 px) dieser Spaltensatz statt `columns`; es wird immer
 * nur ein Satz gerendert. Die Zeilen müssen die Schlüssel beider Sätze enthalten.
 * Läuft die Tabelle seitlich über (`overflowing`), wird der Scroll-Bereich fokussierbar
 * (`tabindex="0"`, `role="region"`, Name = `caption`), damit er per Tastatur scrollbar ist (14b).
 */
@Component({
  selector: 'app-data-table',
  imports: [ChipComponent, RouterLink],
  templateUrl: './data-table.html',
  styleUrl: './data-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent {
  readonly caption = input.required<string>();
  /** Caption nur für Screenreader (z. B. wenn eine sichtbare Überschrift schon benennt). */
  readonly captionHidden = input(false);
  readonly columns = input.required<readonly DataTableColumn[]>();
  /** Optionaler Spaltensatz für Breiten unter 48em (z. B. Max/Min in einer Spalte). */
  readonly columnsNarrow = input<readonly DataTableColumn[] | undefined>(undefined);
  readonly rows = input.required<readonly DataTableRow[]>();
  /** Text, wenn `rows` leer ist. */
  readonly emptyText = input('Keine Werte vorhanden.');

  private readonly narrow = signal(false);
  readonly activeColumns = computed(() => (this.narrow() && this.columnsNarrow()) || this.columns());

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly table = viewChild.required<ElementRef<HTMLElement>>('table');
  /** Tabelle breiter als ihr Container (z. B. „Werte als Tabelle“ bei 375 px): Scroll-Bereich fokussierbar. */
  readonly overflowing = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Überlauf neu prüfen, wenn sich Container oder Tabelle ändern (Breite, Spaltensatz, Zeilen,
    // Öffnen von <details>: vorher ist die Größe 0).
    afterNextRender(() => {
      this.checkOverflow();
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(() => this.checkOverflow());
      observer.observe(this.scroller().nativeElement);
      observer.observe(this.table().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(max-width: 47.99em)');
    this.narrow.set(query.matches);
    const onChange = (e: MediaQueryListEvent) => this.narrow.set(e.matches);
    query.addEventListener('change', onChange);
    destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  /** Gleiche Bedingung wie axe `scrollable-region-focusable`: `scrollWidth > clientWidth`. */
  checkOverflow(): void {
    const el = this.scroller().nativeElement;
    this.overflowing.set(el.scrollWidth > el.clientWidth);
  }

  isIcon(value: DataTableValue): value is DataTableIcon {
    return typeof value === 'object' && value !== null && 'icon' in value;
  }

  isChip(value: DataTableValue): value is DataTableChip {
    return typeof value === 'object' && value !== null && 'chip' in value;
  }

  isLink(value: DataTableValue): value is DataTableLink {
    return typeof value === 'object' && value !== null && 'link' in value;
  }

  text(value: DataTableValue): string {
    if (value === null || value === undefined || value === '') return '–';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('de-DE') : '–';
    if (this.isChip(value)) return value.chip;
    if (this.isIcon(value) || this.isLink(value)) return value.text;
    return value;
  }
}
