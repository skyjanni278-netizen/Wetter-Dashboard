import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, VersionColumn } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { Import } from '../imports/import.entity';
import { Location } from '../locations/location.entity';
import type { ObservationSource } from './observation';

/** Die 28 gültigen WMO-Wettercodes (R15), auch im `CHECK` der Tabelle. */
export const WMO_CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
] as const;

/**
 * Tabelle `observation` (03 B2.3, B2.5, B2.6): ein Stundenwert je Standort und UTC-Stunde.
 * - Schlüssel ist `time_utc` (`YYYY-MM-DDTHH:MM:SSZ`); `local_date`, `local_hour` und `utc_offset_min`
 *   berechnet BerlinTime einmal beim Schreiben (SQLite kennt keine Zeitzonen).
 * - Grenzen aus R15/R16 als `CHECK`; `null` heißt „unbekannt“ (R14), eine fehlende Zeile ist eine Lücke.
 * - `version` und `updated_at` setzt **jeder** Schreibweg ausdrücklich (rohes SQL, B2.4), sie bilden mit
 *   `COUNT(*)` die Datenrevision für den Cache.
 */
@Entity({ name: 'observation' })
@Unique('UQ_observation_location_time', ['locationId', 'timeUtc'])
@Index('IDX_observation_location_date', ['locationId', 'localDate'])
@Index('IDX_observation_updated_at', ['updatedAt'])
@Check('CHK_observation_source', `"source" IN ('archive','forecast_api','prediction')`)
@Check('CHK_observation_local_hour', '"local_hour" BETWEEN 0 AND 23')
@Check('CHK_observation_utc_offset', '"utc_offset_min" IN (60,120)')
@Check('CHK_observation_temperature', '"temperature" IS NULL OR "temperature" BETWEEN -50 AND 50')
@Check(
  'CHK_observation_apparent_temperature',
  '"apparent_temperature" IS NULL OR "apparent_temperature" BETWEEN -70 AND 60',
)
@Check('CHK_observation_precipitation', '"precipitation" IS NULL OR "precipitation" BETWEEN 0 AND 200')
@Check('CHK_observation_wind_speed', '"wind_speed" IS NULL OR "wind_speed" BETWEEN 0 AND 300')
@Check('CHK_observation_wind_direction', '"wind_direction" IS NULL OR "wind_direction" BETWEEN 0 AND 360')
@Check('CHK_observation_weather_code', `"weather_code" IS NULL OR "weather_code" IN (${WMO_CODES.join(',')})`)
export class Observation {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'location_id', type: 'integer' })
  locationId!: number;

  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id', foreignKeyConstraintName: 'FK_observation_location' })
  location?: Location;

  @Column({ name: 'time_utc', type: 'text', transformer: utcTransformer })
  timeUtc!: string;

  @Column({ name: 'local_date', type: 'text' })
  localDate!: string;

  @Column({ name: 'local_hour', type: 'integer' })
  localHour!: number;

  @Column({ name: 'utc_offset_min', type: 'integer' })
  utcOffsetMin!: number;

  @Column({ type: 'real', nullable: true })
  temperature!: number | null;

  @Column({ name: 'apparent_temperature', type: 'real', nullable: true })
  apparentTemperature!: number | null;

  @Column({ type: 'real', nullable: true })
  precipitation!: number | null;

  @Column({ name: 'weather_code', type: 'integer', nullable: true })
  weatherCode!: number | null;

  @Column({ name: 'wind_speed', type: 'real', nullable: true })
  windSpeed!: number | null;

  @Column({ name: 'wind_direction', type: 'integer', nullable: true })
  windDirection!: number | null;

  @Column({ type: 'text' })
  source!: ObservationSource;

  /** Import, der die Stunde zuletzt geschrieben hat (beim Altbestand der Import `kind = "legacy"`). */
  @Column({ name: 'import_id', type: 'integer' })
  importId!: number;

  @ManyToOne(() => Import, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'import_id', foreignKeyConstraintName: 'FK_observation_import' })
  import?: Import;

  @Column({ name: 'fetched_at', type: 'text', transformer: utcTransformer })
  fetchedAt!: string;

  /** Gesetzt durch eine Korrektur (ab Schritt 12a); ein Import überschreibt die Stunde dann nicht (R20). */
  @Column({ name: 'corrected_at', type: 'text', nullable: true, transformer: utcTransformer })
  correctedAt!: string | null;

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'updated_at', type: 'text', transformer: utcTransformer })
  updatedAt!: string;
}
