import { InitialSchema1795259262137 } from './1795259262137-InitialSchema';
import { Stammdaten1795259300000 } from './1795259300000-Stammdaten';

/**
 * Alle Migrationen in Ausführungsreihenfolge, als Klassen statt Glob (gleich für `src/`, `dist/` und Jest).
 * Eine neue Migration (`npm run migration:generate -- src/database/migrations/<Name>`) hier eintragen.
 */
export const MIGRATIONS = [InitialSchema1795259262137, Stammdaten1795259300000];
