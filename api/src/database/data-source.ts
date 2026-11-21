import { DataSource } from 'typeorm';
import { dataSourceOptions } from './database-options';
import { resolveDbPath } from './db-path';

/**
 * DataSource für die TypeORM-CLI (`npm run migration:run|revert|generate`, 03 B4.4), mit denselben Optionen
 * wie die App. Die Skripte nutzen die gebaute Fassung `dist/database/data-source.js` (kein ts-node im
 * Projekt). Ziel ist `DB_PATH`, ohne Angabe die Dev-DB `%LOCALAPPDATA%\wetter-heubach\weather.dev.db`.
 */
export default new DataSource(dataSourceOptions(resolveDbPath()));
