import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { APP_OPTIONS, configureApp } from '../../src/app.setup';
import { passwordScanMiddleware } from './password-scan';

/**
 * App für e2e-Tests wie in `main.ts`: Präfix `/api`, Request-ID, 406/415-Middleware, JSON-Parser mit
 * 64 KB Limit und globaler `ApiExceptionFilter` (aus `AppModule`), danach `init`. `env` steuert
 * `SWAGGER_ENABLED` (Standard: ohne Swagger, unabhängig von `process.env`). Vor allem anderen prüft
 * `passwordScanMiddleware` jede Antwort auf „password“ (Schritt 10, 03 B4.6).
 */
export async function createTestApp(moduleRef: TestingModule, env: NodeJS.ProcessEnv = {}): Promise<INestApplication<App>> {
  const nest = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  nest.use(passwordScanMiddleware);
  const app = configureApp(nest, env);
  await app.init();
  return app as unknown as INestApplication<App>;
}
