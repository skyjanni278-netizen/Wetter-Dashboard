import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../../src/database/database-options';
import { MEMORY_DB } from '../../src/database/db-path';
import type { ImportKind, ImportStatus } from '../../src/imports/import';

/**
 * Echte SQLite-Datenbank für Tests (better-sqlite3), Schema über die Migrationen wie im Betrieb.
 * Standard `:memory:`; für Neustart- und Reset-Tests eine Datei im Temp-Ordner.
 */
export async function openTestDatabase(dbPath: string = MEMORY_DB): Promise<DataSource> {
  const dataSource = new DataSource({ ...dataSourceOptions(dbPath), migrationsRun: true });
  await dataSource.initialize();
  return dataSource;
}

/** Legt einen abgeschlossenen Import an (Fremdschlüssel `observation.import_id`) und liefert seine ID. */
export async function insertImport(
  dataSource: DataSource,
  values: { kind?: ImportKind; status?: ImportStatus; from?: string; to?: string; at?: string } = {},
): Promise<number> {
  const at = values.at ?? '2026-11-19T12:00:00Z';
  const [row]: { id: number }[] = await dataSource.query(
    `INSERT INTO "import" ("location_id", "kind", "status", "from_date", "to_date", "requested_at", "started_at", "finished_at")
     VALUES (1, ?, ?, ?, ?, ?, ?, ?) RETURNING "id"`,
    [
      values.kind ?? 'range',
      values.status ?? 'succeeded',
      values.from ?? '2026-11-01',
      values.to ?? '2026-11-19',
      at,
      values.status === 'queued' ? null : at,
      values.status === 'queued' || values.status === 'running' ? null : at,
    ],
  );
  return row.id;
}

export interface StoredRow {
  time_utc: string;
  local_date: string;
  local_hour: number;
  utc_offset_min: number;
  temperature: number | null;
  source: string;
  import_id: number;
  fetched_at: string;
  corrected_at: string | null;
  version: number;
  updated_at: string;
}

/** Eine gespeicherte Stunde, wie sie in der Tabelle steht. */
export async function storedRow(dataSource: DataSource, timeUtc: string): Promise<StoredRow | undefined> {
  const [row]: StoredRow[] = await dataSource.query(`SELECT * FROM "observation" WHERE "time_utc" = ?`, [timeUtc]);
  return row;
}
