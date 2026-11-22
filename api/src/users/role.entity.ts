import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Die einzige Rolle (03 B1.1): „Gast“ ist anonym und keine Rolle in der Datenbank. */
export const ADMIN_ROLE = 'admin';

/** Beschreibung der Rolle `admin` in der Daten-Migration `RolleAdmin` (03 B2.2). */
export const ADMIN_ROLE_DESCRIPTION = 'Datenimport, Korrekturen, Protokolle';

/** Tabelle `role` (03 B2.3, B2.6): Stammdaten, `admin` kommt über die Daten-Migration `RolleAdmin`. */
@Entity({ name: 'role' })
@Unique('UQ_role_name', ['name'])
export class Role {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;
}
