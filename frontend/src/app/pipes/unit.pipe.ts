import { Pipe, PipeTransform, LOCALE_ID, inject } from '@angular/core';
import { formatNumber } from '@angular/common';

/** Schmales geschütztes Leerzeichen (U+202F) zwischen Zahl und Einheit (V11). */
export const UNIT_SEPARATOR = ' ';

/**
 * Zahl in der aktuellen Locale plus Einheit, z. B. `9.7 | unit:'°C':'1.0-1'` ergibt „9,7 °C“.
 * Fehlt der Wert (null/undefined/NaN), erscheint „–“.
 */
@Pipe({ name: 'unit', standalone: true })
export class UnitPipe implements PipeTransform {
  private locale = inject(LOCALE_ID);

  transform(value: number | null | undefined, unit: string, digitsInfo = '1.0-1'): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '–';
    return `${formatNumber(value, this.locale, digitsInfo)}${UNIT_SEPARATOR}${unit}`;
  }
}
