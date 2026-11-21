import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { bodyParserErrorMiddleware, JSON_BODY_LIMIT, JSON_MEDIA_TYPES } from './common/body-parser';
import { ContentNegotiationMiddleware } from './common/content-negotiation.middleware';
import { requestIdMiddleware } from './common/request-id';
import { isSwaggerEnabled, setupSwagger } from './openapi/swagger';

/** Nest registriert keinen eigenen Body-Parser; den JSON-Parser mit Limit setzt `configureApp`. */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/**
 * Gemeinsame Einrichtung für `main.ts` und die e2e-Tests (vor `init`/`listen`), Reihenfolge nach 03 B4.3:
 * 1. `X-Request-Id` für jede Antwort,
 * 2. `ContentNegotiationMiddleware` (406/415) vor dem Parsen,
 * 3. JSON-Parser mit 64 KB Limit (nur `application/json` und `application/merge-patch+json`),
 * 4. Parser-Fehler (413, kaputtes JSON) als `ApiException` an den globalen `ApiExceptionFilter`,
 * 5. nur bei `SWAGGER_ENABLED=true`: Swagger UI `/api/docs` und `/api/docs-json` (03 B3.7).
 * Danach folgen Guards, Pipes und Controller von Nest. `env` ist für Tests austauschbar.
 */
export function configureApp(app: NestExpressApplication, env: NodeJS.ProcessEnv = process.env): NestExpressApplication {
  app.setGlobalPrefix('api');
  const negotiation = new ContentNegotiationMiddleware();
  app.use(requestIdMiddleware);
  app.use(negotiation.use.bind(negotiation));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT, type: JSON_MEDIA_TYPES });
  app.use(bodyParserErrorMiddleware);
  if (isSwaggerEnabled(env)) setupSwagger(app);
  return app;
}
