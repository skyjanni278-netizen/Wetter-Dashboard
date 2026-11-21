import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database-options';
import { DB_PATH, resolveDbPath } from './db-path';

/** Stellt nur den Pfad bereit (Token `DB_PATH`), damit Tests ihn per `overrideProvider` ersetzen können. */
@Module({
  providers: [{ provide: DB_PATH, useFactory: () => resolveDbPath() }],
  exports: [DB_PATH],
})
export class DbPathModule {}

/**
 * Verbindung zur SQLite-Datei (03 B4.4) mit den Optionen aus `database-options.ts`. `TypeOrmModule.forRoot`
 * stellt `DataSource` global bereit; die Fachmodule holen ihre Repositories mit `TypeOrmModule.forFeature`.
 * Kann die Datei beim Start nicht geöffnet werden, bricht der Start ab (ein Versuch, kein Warten).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [DbPathModule],
      inject: [DB_PATH],
      useFactory: (dbPath: string) => ({ ...dataSourceOptions(dbPath), retryAttempts: 0 }),
    }),
  ],
})
export class DatabaseModule {}
