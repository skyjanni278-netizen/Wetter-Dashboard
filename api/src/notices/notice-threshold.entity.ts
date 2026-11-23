import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Arten der Hinweise (03 B2.2 „notices“, R30). */
export const NOTICE_TYPES = ['frost', 'heat', 'heavy_rain'] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

/** Spalten von `daily_forecast`, mit denen eine Schwelle vergleicht (Schreibweise der DB). */
export const NOTICE_FIELDS = ['min_temp', 'max_temp', 'precipitation_sum'] as const;
export type NoticeField = (typeof NOTICE_FIELDS)[number];

/** Vergleichsoperatoren: `lt` = Wert < Schwelle, `gte` = Wert ≥ Schwelle. */
export const NOTICE_COMPARATORS = ['lt', 'gte'] as const;
export type NoticeComparator = (typeof NOTICE_COMPARATORS)[number];

const inList = (values: readonly string[]) => values.map(v => `'${v}'`).join(',');

/**
 * Tabelle `notice_threshold` (03 B2.3, B2.6, R30; Schritt 12c): Stammdaten der Hinweisschwellen, ohne
 * Fremdschlüssel und ohne Endpunkt zum Ändern. Die drei Zeilen kommen per Daten-Migration
 * `Hinweisschwellen`; ein unbekannter Typ, ein unbekanntes Feld oder ein ungültiger Vergleichsoperator
 * scheitert am `CHECK` der Datenbank.
 */
@Entity({ name: 'notice_threshold' })
@Unique('UQ_notice_threshold_type', ['type'])
@Check('CHK_notice_threshold_type', `"type" IN (${inList(NOTICE_TYPES)})`)
@Check('CHK_notice_threshold_field', `"field" IN (${inList(NOTICE_FIELDS)})`)
@Check('CHK_notice_threshold_comparator', `"comparator" IN (${inList(NOTICE_COMPARATORS)})`)
export class NoticeThreshold {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  type!: NoticeType;

  @Column({ type: 'text' })
  field!: NoticeField;

  @Column({ type: 'text' })
  comparator!: NoticeComparator;

  /** Schwelle, ungerundet verglichen (R30). */
  @Column({ type: 'real' })
  value!: number;

  /** Einheit für die Anzeige, z. B. `°C` oder `mm`. */
  @Column({ type: 'text' })
  unit!: string;
}
