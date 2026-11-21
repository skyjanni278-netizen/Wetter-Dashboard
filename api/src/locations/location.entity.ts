import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';

/**
 * Tabelle `location` (03 B2.3, B2.6). Stammdatum: Heubach kommt über die Daten-Migration `Stammdaten`.
 * Bis zum Repository der Locations nutzen die Module weiter die Konstante `HEUBACH` (gleiche Werte, `id = 1`).
 */
@Entity({ name: 'location' })
@Unique('UQ_location_slug', ['slug'])
@Check('CHK_location_latitude', '"latitude" BETWEEN -90 AND 90')
@Check('CHK_location_longitude', '"longitude" BETWEEN -180 AND 180')
export class Location {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'postal_code', type: 'text' })
  postalCode!: string;

  @Column({ type: 'text' })
  region!: string;

  @Column({ type: 'real' })
  latitude!: number;

  @Column({ type: 'real' })
  longitude!: number;

  @Column({ type: 'text', default: 'Europe/Berlin' })
  timezone!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'created_at', type: 'text', transformer: utcTransformer })
  createdAt!: string;
}
