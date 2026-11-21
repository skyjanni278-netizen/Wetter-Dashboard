/** Teil der better-sqlite3-Verbindung, den `prepareDatabase` braucht (vermeidet den Typ-Import des Pakets). */
export interface PragmaConnection {
  pragma(source: string, options?: { simple?: boolean }): unknown;
}

/** Wartezeit bei gesperrter Datei (zweiter Prozess, z. B. CLI), bevor `SQLITE_BUSY` kommt (03 B4.4). */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Läuft einmal je Verbindung, bevor TypeORM sie nutzt (03 B4.4, B2.6):
 * - `journal_mode = WAL`: Leser blockieren den Schreiber nicht (bei `:memory:` bleibt es `memory`),
 * - `foreign_keys = ON`: in SQLite standardmäßig **aus** (der Treiber setzt es zusätzlich),
 * - `busy_timeout = 5000`, `synchronous = NORMAL` (mit WAL sicher und schneller als `FULL`).
 */
export function prepareDatabase(db: PragmaConnection): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.pragma('synchronous = NORMAL');
}
