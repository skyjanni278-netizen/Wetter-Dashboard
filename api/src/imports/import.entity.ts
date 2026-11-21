import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { Location } from '../locations/location.entity';
import type { ImportKind, ImportStatus } from './import';

/**
 * Tabelle `import` (03 B2.3, B2.5, B2.6): Protokoll aller Importe, überlebt einen Neustart (F32).
 * R19 sichert zusätzlich der partielle Unique-Index `UQ_import_active`: höchstens ein Import je Standort
 * mit Status `queued`/`running`, auch bei zwei gleichzeitigen Anfragen.
 * `requested_by` bekommt seinen Fremdschlüssel auf `user` mit der Anmeldung (Schritt 10).
 */
@Entity({ name: 'import' })
@Index('UQ_import_active', ['locationId'], { unique: true, where: `"status" IN ('queued','running')` })
@Check('CHK_import_kind', `"kind" IN ('legacy','range','gaps','scheduled')`)
@Check('CHK_import_status', `"status" IN ('queued','running','succeeded','partial','failed')`)
@Check('CHK_import_dates', '"from_date" <= "to_date"')
export class Import {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'location_id', type: 'integer' })
  locationId!: number;

  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id', foreignKeyConstraintName: 'FK_import_location' })
  location?: Location;

  @Column({ type: 'text' })
  kind!: ImportKind;

  @Column({ type: 'text' })
  status!: ImportStatus;

  @Column({ name: 'from_date', type: 'text' })
  fromDate!: string;

  @Column({ name: 'to_date', type: 'text' })
  toDate!: string;

  @Column({ name: 'overwrite_corrections', type: 'boolean', default: false })
  overwriteCorrections!: boolean;

  @Column({ name: 'requested_by', type: 'integer', nullable: true })
  requestedBy!: number | null;

  @Column({ name: 'requested_at', type: 'text', transformer: utcTransformer })
  requestedAt!: string;

  @Column({ name: 'started_at', type: 'text', nullable: true, transformer: utcTransformer })
  startedAt!: string | null;

  @Column({ name: 'finished_at', type: 'text', nullable: true, transformer: utcTransformer })
  finishedAt!: string | null;

  @Column({ name: 'count_inserted', type: 'integer', default: 0 })
  countInserted!: number;

  @Column({ name: 'count_updated', type: 'integer', default: 0 })
  countUpdated!: number;

  @Column({ name: 'count_unchanged', type: 'integer', default: 0 })
  countUnchanged!: number;

  @Column({ name: 'count_skipped_corrected', type: 'integer', default: 0 })
  countSkippedCorrected!: number;

  /** Warnungen als JSON-Array (`[]` ohne Warnung, 03 B2.5). */
  @Column({ name: 'warnings_json', type: 'text', default: '[]' })
  warningsJson!: string;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode!: string | null;

  /** Nur für den Admin (`GET /api/imports/:id`), ohne Stacktrace. */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;
}
