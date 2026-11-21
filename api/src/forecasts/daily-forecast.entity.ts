import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { Import } from '../imports/import.entity';
import { Location } from '../locations/location.entity';

/**
 * Tabelle `daily_forecast` (03 B2.3, B2.5, B2.6): ein Vorhersagetag je Standort und Berliner Datum. Ein
 * neuer Abruf überschreibt die Tage, die er liefert; `fetched_at` zeigt, aus welchem Abruf ein Tag stammt.
 */
@Entity({ name: 'daily_forecast' })
@Unique('UQ_daily_forecast_location_date', ['locationId', 'date'])
@Check('CHK_daily_forecast_min_max', '"min_temp" IS NULL OR "max_temp" IS NULL OR "min_temp" <= "max_temp"')
export class DailyForecast {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'location_id', type: 'integer' })
  locationId!: number;

  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id', foreignKeyConstraintName: 'FK_daily_forecast_location' })
  location?: Location;

  /** Berliner Kalendertag `YYYY-MM-DD`. */
  @Column({ type: 'text' })
  date!: string;

  @Column({ name: 'max_temp', type: 'real', nullable: true })
  maxTemp!: number | null;

  @Column({ name: 'min_temp', type: 'real', nullable: true })
  minTemp!: number | null;

  @Column({ name: 'precipitation_sum', type: 'real', nullable: true })
  precipitationSum!: number | null;

  @Column({ name: 'weather_code', type: 'integer', nullable: true })
  weatherCode!: number | null;

  @Column({ name: 'fetched_at', type: 'text', transformer: utcTransformer })
  fetchedAt!: string;

  /** Import, der den Tag geliefert hat; `null` nur, wenn die Vorhersage ohne Import gespeichert wurde. */
  @Column({ name: 'import_id', type: 'integer', nullable: true })
  importId!: number | null;

  @ManyToOne(() => Import, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'import_id', foreignKeyConstraintName: 'FK_daily_forecast_import' })
  import?: Import | null;
}
