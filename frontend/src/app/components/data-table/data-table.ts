import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
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

  constructor() {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(max-width: 47.99em)');
    this.narrow.set(query.matches);
    const onChange = (e: MediaQueryListEvent) => this.narrow.set(e.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
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
