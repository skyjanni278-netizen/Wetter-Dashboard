import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { APP_OPTIONS, configureApp } from '../../src/app.setup';
import { passwordScanMiddleware } from './password-scan';

/**
 * App für e2e-Tests wie in `main.ts`: Sicherheitsheader, Präfix `/api`, Request-ID, 406/415-Middleware,
 * JSON-Parser mit 64 KB Limit und globaler `ApiExceptionFilter` (aus `AppModule`), danach `init`. Die Werte
 * (z. B. `SWAGGER_ENABLED`, `CORS_ORIGINS`) kommen aus dem `ConfigService` der App; andere Werte setzt ein Test
 * mit `overrideProvider(ConfigService)` (`test/support/config.ts`). Vor allem anderen prüft
 * `passwordScanMiddleware` jede Antwort auf „password“ (Schritt 10, 03 B4.6).
 */
export async function createTestApp(moduleRef: TestingModule): Promise<INestApplication<App>> {
  const nest = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  nest.use(passwordScanMiddleware);
  const app = configureApp(nest);
  await app.init();
  return app as unknown as INestApplication<App>;
}
