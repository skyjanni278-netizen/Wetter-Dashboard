import type { DataSource } from 'typeorm';

/** Kennzeichen echter, gesammelter Daten (03 B4.4, F16, V34): Altdatenimport oder stündlicher Abruf. */
export const COLLECTED_KINDS = ['legacy', 'scheduled'] as const;

/** Schalter, mit dem Seeds und `db:reset` trotz gesammelter Daten weiterlaufen (nicht in Produktion). */
export const FORCE_FLAG = '--force-delete-collected-data';

/** Seeds bzw. `db:reset` verweigert; die Datenbank ist unverändert. */
export class CollectedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectedDataError';
  }
}

/** Anzahl der Importe `legacy`/`scheduled`; ohne Tabelle `import` (leere oder neue Datei) 0. */
export async function countCollectedImports(dataSource: DataSource): Promise<number> {
  const [table]: { n: number }[] = await dataSource.query(
    `SELECT COUNT(*) AS "n" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'import'`,
  );
  if (!table || table.n === 0) return 0;
  const [row]: { n: number }[] = await dataSource.query(
    `SELECT COUNT(*) AS "n" FROM "import" WHERE "kind" IN (${COLLECTED_KINDS.map(k => `'${k}'`).join(', ')})`,
  );
  return row?.n ?? 0;
}

/** (1) Nie in Produktion, auch nicht mit dem Schalter (03 B4.4). */
export function assertNotProduction(env: NodeJS.ProcessEnv, action: string): void {
  if (env['NODE_ENV'] === 'production') {
    throw new CollectedDataError(`${action} ist mit NODE_ENV=production verboten.`);
  }
}

/**
 * (2) Enthält die Datenbank gesammelte Daten (`import.kind IN ('legacy','scheduled')`), bricht `action` ab,
 * außer mit `--force-delete-collected-data`. `dataSource = null`: Es gibt noch keine Datei.
 */
export async function assertMayDeleteData(
  dataSource: DataSource | null,
  options: { env: NodeJS.ProcessEnv; force: boolean; action: string; dbPath: string },
): Promise<void> {
  assertNotProduction(options.env, options.action);
  if (!dataSource || options.force) return;
  const collected = await countCollectedImports(dataSource);
  if (collected > 0) {
    throw new CollectedDataError(
      `${options.action} abgebrochen: ${options.dbPath} enthält gesammelte Daten (${collected} Import(e) ` +
        `${COLLECTED_KINDS.join('/')}). Die Datenbank bleibt unverändert. Ist das wirklich gewollt, ` +
        `erneut mit ${FORCE_FLAG} aufrufen.`,
    );
  }
}
