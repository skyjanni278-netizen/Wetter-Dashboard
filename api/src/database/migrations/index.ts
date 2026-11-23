import { InitialSchema1795259262137 } from './1795259262137-InitialSchema';
import { Stammdaten1795259300000 } from './1795259300000-Stammdaten';
import { Users1795356900000 } from './1795356900000-Users';
import { RolleAdmin1795356960000 } from './1795356960000-RolleAdmin';
import { CorrectionUser1795443600000 } from './1795443600000-CorrectionUser';

/**
 * Alle Migrationen in Ausführungsreihenfolge, als Klassen statt Glob (gleich für `src/`, `dist/` und Jest).
 * Eine neue Migration (`npm run migration:generate -- src/database/migrations/<Name>`) hier eintragen.
 */
export const MIGRATIONS = [
  InitialSchema1795259262137,
  Stammdaten1795259300000,
  Users1795356900000,
  RolleAdmin1795356960000,
  CorrectionUser1795443600000,
];
