import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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

export type DataTableValue = string | number | null | undefined | DataTableChip;
export type DataTableRow = Readonly<Record<string, DataTableValue>>;

/**
 * Tabelle (E3.7.5): `<caption>`, Spaltenköpfe `<th scope="col">` in Inter 600 GROSS mit
 * 2-px-Linie, Zeilen mit 1-px-Linien, Hover-Zeile `--color-surface-muted`.
 * Werte formatiert die aufrufende Stelle (Rundung erst bei der Ausgabe); Zahlen ohne
 * Formatierung erscheinen deutsch, fehlende Werte als „–“.
 */
@Component({
  selector: 'app-data-table',
  imports: [ChipComponent],
  templateUrl: './data-table.html',
  styleUrl: './data-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent {
  readonly caption = input.required<string>();
  /** Caption nur für Screenreader (z. B. wenn eine sichtbare Überschrift schon benennt). */
  readonly captionHidden = input(false);
  readonly columns = input.required<readonly DataTableColumn[]>();
  readonly rows = input.required<readonly DataTableRow[]>();
  /** Text, wenn `rows` leer ist. */
  readonly emptyText = input('Keine Werte vorhanden.');

  isChip(value: DataTableValue): value is DataTableChip {
    return typeof value === 'object' && value !== null && 'chip' in value;
  }

  text(value: DataTableValue): string {
    if (value === null || value === undefined || value === '') return '–';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('de-DE') : '–';
    if (this.isChip(value)) return value.chip;
    return value;
  }
}
