import { DATA_START } from '../config/data-range';
import { YearList } from '../models/api';
import { berlinToday } from './berlin-date';

/**
 * Jahre für die Jahresauswahl (Monat und Jahr), neuestes zuerst (F20).
 * - `list`: Antwort von `GET /api/summaries/years`; die Auswahl zeigt genau diese Jahre.
 * - `null` (Liste lädt noch oder ist fehlgeschlagen): Übergang wie bisher von DATA_START bis zum
 *   aktuellen Berliner Jahr, damit das Feld sofort das gewählte Jahr zeigt.
 * - `selected`: gültiges Jahr aus der URL, das (noch) nicht in der Liste steht, kommt dazu,
 *   damit das Feld nicht ein anderes Jahr anzeigt als die Seite.
 */
export function yearOptions(list: YearList | null, selected: string | null, today: string = berlinToday()): string[] {
  const years = new Set<string>(list
    ? list.items.map(item => String(item.year))
    : rangeFromDataStart(today));
  if (selected) years.add(selected);
  return [...years].sort((a, b) => b.localeCompare(a));
}

function rangeFromDataStart(today: string): string[] {
  const first = parseInt(DATA_START.slice(0, 4), 10);
  const last = parseInt(today.slice(0, 4), 10);
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, i) => String(first + i));
}
