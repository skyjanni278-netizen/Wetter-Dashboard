import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { utcTransformer } from '../database/utc.transformer';
import { UserRole } from './user-role.entity';

/**
 * Tabelle `user` (03 B2.3, B2.5, B2.6): Admin-Konto. `password_hash` (bcrypt) ist Pflicht, wird aber nur für
 * die Anmeldung ausdrücklich gelesen (`select: false`, `UsersService.findForLogin`); Antworten entstehen nur über
 * Mapper (`toUserResource`, `toTokenUser`), nie aus der Entity.
 */
@Entity({ name: 'user' })
@Unique('UQ_user_username', ['username'])
export class User {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  username!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'text', transformer: utcTransformer })
  createdAt!: string;

  @Column({ name: 'last_login_at', type: 'text', nullable: true, transformer: utcTransformer })
  lastLoginAt!: string | null;

  @OneToMany(() => UserRole, userRole => userRole.user)
  userRoles?: UserRole[];
}
