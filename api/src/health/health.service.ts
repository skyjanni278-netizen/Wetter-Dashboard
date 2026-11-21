import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/api.exception';
import type { Health } from './health';

/**
 * US14-3: Die Datenbank gilt als lesbar, wenn eine Abfrage auf eine Tabelle gelingt (nicht nur `SELECT 1`,
 * das ohne Zugriff auf die Datei auskäme). Sonst 503 `SERVICE_UNAVAILABLE` im Fehlerformat B3.3 mit
 * `details.database = "error"`; die Ursache steht nur im Log.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<Health> {
    try {
      await this.dataSource.query('SELECT COUNT(*) AS "n" FROM "location"');
    } catch (error) {
      this.logger.error(`Datenbank nicht lesbar: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'Die Datenbank ist nicht lesbar.', {
        details: { database: 'error' },
      });
    }
    return { status: 'ok', database: 'ok' };
  }
}
