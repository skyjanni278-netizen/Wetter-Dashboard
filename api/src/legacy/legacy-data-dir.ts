import path from 'node:path';

/** DI-Token für den Ordner mit den Altdaten von Express (`backend/data`). */
export const LEGACY_DATA_DIR = 'LEGACY_DATA_DIR';

/** Standard relativ zum Arbeitsverzeichnis `api/` (npm-Skripte laufen immer dort). */
export const DEFAULT_LEGACY_DATA_DIR = '../backend/data';

/**
 * Übergangslösung bis Schritt 9: Ordner aus `LEGACY_DATA_DIR` oder Standard,
 * relative Angaben werden gegen das Arbeitsverzeichnis aufgelöst.
 */
export function resolveLegacyDataDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env['LEGACY_DATA_DIR']?.trim();
  return path.resolve(cwd, configured ? configured : DEFAULT_LEGACY_DATA_DIR);
}
