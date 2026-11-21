import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { APP_OPTIONS, configureApp } from '../../src/app.setup';

/**
 * App für e2e-Tests wie in `main.ts`: Präfix `/api`, Request-ID, 406/415-Middleware, JSON-Parser mit
 * 64 KB Limit und globaler `ApiExceptionFilter` (aus `AppModule`), danach `init`. `env` steuert
 * `SWAGGER_ENABLED` (Standard: ohne Swagger, unabhängig von `process.env`).
 */
export async function createTestApp(moduleRef: TestingModule, env: NodeJS.ProcessEnv = {}): Promise<INestApplication<App>> {
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS), env);
  await app.init();
  return app as unknown as INestApplication<App>;
}
