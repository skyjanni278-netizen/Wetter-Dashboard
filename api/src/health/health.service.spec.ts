import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { openTestDatabase } from '../../test/support/database';
import { ApiException } from '../common/api.exception';
import { HealthService } from './health.service';

describe('HealthService (US14-3)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lesbare Datenbank → { status: "ok", database: "ok" }', async () => {
    const dataSource = await openTestDatabase();
    try {
      expect(await new HealthService(dataSource).check()).toEqual({ status: 'ok', database: 'ok' });
    } finally {
      await dataSource.destroy();
    }
  });

  it('Abfrage scheitert → 503 SERVICE_UNAVAILABLE, details.database = "error", Ursache nur im Log', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const broken = { query: async () => Promise.reject(new Error('SQLITE_CANTOPEN: unable to open database file')) };

    const error: unknown = await new HealthService(broken as unknown as DataSource).check().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(503);
    expect((error as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', details: { database: 'error' } });
    expect(JSON.stringify((error as ApiException).getResponse())).not.toContain('SQLITE_CANTOPEN');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SQLITE_CANTOPEN'));
  });
});
