/**
 * Tabelle der Importe (E3.7.5) für das Protokoll (`imports-page`) und die letzten Importe der
 * Statusseite: Nummer als Link auf die Detailseite, Status als Chip mit Statusfarbe als Text.
 */
import type { DataTableColumn, DataTableRow } from '../../components/data-table/data-table';
import type { ImportResource } from '../../models/api';
import {
  IMPORT_KIND_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_VARIANT, formatDateTimeBerlin, formatPeriod,
} from '../../utils/admin-format';

/** Ab 768 px. */
export const IMPORT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'id', label: 'Nr.', rowHeader: true },
  { key: 'kind', label: 'Art' },
  { key: 'period', label: 'Zeitraum' },
  { key: 'requestedAt', label: 'Angefordert' },
  { key: 'inserted', label: 'Neu', align: 'end' },
  { key: 'updated', label: 'Geändert', align: 'end' },
  { key: 'status', label: 'Status' },
];

/** Unter 768 px nur Nummer, Zeitraum und Status. */
export const IMPORT_COLUMNS_NARROW: readonly DataTableColumn[] = [
  { key: 'id', label: 'Nr.', rowHeader: true },
  { key: 'period', label: 'Zeitraum' },
  { key: 'status', label: 'Status' },
];

export function importRow(item: ImportResource): DataTableRow {
  return {
    id: { link: ['/admin/importe', item.id], text: `#${item.id}`, label: `Import #${item.id} ansehen` },
    kind: IMPORT_KIND_LABEL[item.kind] ?? item.kind,
    period: formatPeriod(item.from, item.to),
    requestedAt: formatDateTimeBerlin(item.requestedAt),
    inserted: item.counts.inserted,
    updated: item.counts.updated,
    status: { chip: IMPORT_STATUS_LABEL[item.status] ?? item.status, variant: IMPORT_STATUS_VARIANT[item.status] ?? 'status' },
  };
}
