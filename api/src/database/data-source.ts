import { DataSource } from 'typeorm';
import { loadEnv } from '../config/config';
import { DatabaseEnvSchema } from '../config/env.schema';
import { dataSourceOptions } from './database-options';
import { resolveDbPath } from './db-path';

/**
 * DataSource für die TypeORM-CLI (`npm run migration:run|revert|generate`, 03 B4.4), mit denselben Optionen
 * wie die App. Die Skripte nutzen die gebaute Fassung `dist/database/data-source.js` (kein ts-node im
 * Projekt). Ziel ist `DB_PATH` aus `api/.env` bzw. der Umgebung (Teilschema `DatabaseEnvSchema`: `NODE_ENV`
 * und `DB_PATH`, **kein** `JWT_SECRET`). Fehlt ein Wert, endet der Befehl mit der Meldung und Exit-Code 1.
 * TypeORM wartet auf das exportierte Promise.
 */
export default loadEnv(DatabaseEnvSchema).then(env => new DataSource(dataSourceOptions(resolveDbPath(env.DB_PATH))));
