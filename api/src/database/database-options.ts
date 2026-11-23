import type { DataSourceOptions } from 'typeorm';
import { DailyForecast } from '../forecasts/daily-forecast.entity';
import { Import } from '../imports/import.entity';
import { Location } from '../locations/location.entity';
import { NoticeThreshold } from '../notices/notice-threshold.entity';
import { Correction } from '../observations/correction.entity';
import { Observation } from '../observations/observation.entity';
import { Role } from '../users/role.entity';
import { UserRole } from '../users/user-role.entity';
import { User } from '../users/user.entity';
import { isMemoryDatabase } from './db-path';
import { MIGRATIONS } from './migrations';
import { prepareDatabase } from './prepare-database';

/** Alle Entities; als Klassen statt Glob, damit `src/` (Jest) und `dist/` (Build, CLI) gleich laden. */
export const ENTITIES = [Location, Import, Observation, DailyForecast, Correction, User, Role, UserRole, NoticeThreshold];

/**
 * Optionen der **einen** DataSource für App (`DatabaseModule`) und TypeORM-CLI (`data-source.ts`), 03 B4.4:
 * `synchronize: false` immer (Schema nur über Migrationen), `migrationsRun: false` für Dateien (Migrationen
 * laufen per `npm run migration:run`). Nur `:memory:` (e2e-Tests) ist immer leer; dort laufen die
 * Migrationen beim Verbinden, sonst gäbe es keine Tabellen.
 */
export function dataSourceOptions(dbPath: string): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: dbPath,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: isMemoryDatabase(dbPath),
    migrationsTransactionMode: 'each',
    prepareDatabase,
  };
}
