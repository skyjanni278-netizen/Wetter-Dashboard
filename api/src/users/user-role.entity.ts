import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { Role } from './role.entity';
import { User } from './user.entity';

/** Tabelle `user_role` (03 B2.3, B2.6): `PRIMARY KEY(user_id, role_id)`, beide FKs mit `ON DELETE CASCADE`. */
@Entity({ name: 'user_role' })
export class UserRole {
  @PrimaryColumn({ name: 'user_id', type: 'integer' })
  userId!: number;

  @PrimaryColumn({ name: 'role_id', type: 'integer' })
  roleId!: number;

  @Column({ name: 'assigned_at', type: 'text', transformer: utcTransformer })
  assignedAt!: string;

  @ManyToOne(() => User, user => user.userRoles, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_user_role_user' })
  user?: User;

  @ManyToOne(() => Role, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'FK_user_role_role' })
  role?: Role;
}
