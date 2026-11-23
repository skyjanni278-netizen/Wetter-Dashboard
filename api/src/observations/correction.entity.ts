import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { User } from '../users/user.entity';
import { Observation } from './observation.entity';

/** Korrigierbare Felder in der Schreibweise der DB (03 B2.2: die API nutzt camelCase, der Mapper setzt um). */
export const CORRECTION_FIELDS = [
  'temperature',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed',
  'wind_direction',
] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

/**
 * Tabelle `correction` (03 B2.3, B2.6): Korrekturhistorie einer Stunde (N03, Schritt 12a). Ein Eintrag je
 * geändertem Feld; eine Rücknahme ist ein eigener Eintrag mit `reverts_correction_id` (R33). Eine Korrektur
 * wird höchstens einmal zurückgenommen (`UNIQUE(reverts_correction_id)`). `corrected_by` zeigt seit der
 * Migration `CorrectionUser` (Schritt 12a) per Fremdschlüssel auf `user` (RESTRICT: die Historie bleibt).
 */
@Entity({ name: 'correction' })
@Unique('UQ_correction_reverts', ['revertsCorrectionId'])
@Index('IDX_correction_corrected_at', ['correctedAt'])
@Check('CHK_correction_field', `"field" IN (${CORRECTION_FIELDS.map(f => `'${f}'`).join(',')})`)
@Check('CHK_correction_reason', 'length("reason") BETWEEN 3 AND 500')
export class Correction {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'observation_id', type: 'integer' })
  observationId!: number;

  @ManyToOne(() => Observation, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'observation_id', foreignKeyConstraintName: 'FK_correction_observation' })
  observation?: Observation;

  @Column({ type: 'text' })
  field!: CorrectionField;

  @Column({ name: 'old_value', type: 'real', nullable: true })
  oldValue!: number | null;

  @Column({ name: 'new_value', type: 'real', nullable: true })
  newValue!: number | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'corrected_by', type: 'integer' })
  correctedBy!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'corrected_by', foreignKeyConstraintName: 'FK_correction_user' })
  user?: User;

  @Column({ name: 'corrected_at', type: 'text', transformer: utcTransformer })
  correctedAt!: string;

  @Column({ name: 'reverts_correction_id', type: 'integer', nullable: true })
  revertsCorrectionId!: number | null;

  @ManyToOne(() => Correction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reverts_correction_id', foreignKeyConstraintName: 'FK_correction_reverts' })
  reverts?: Correction | null;
}
