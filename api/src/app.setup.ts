import type { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { bodyParserErrorMiddleware, JSON_BODY_LIMIT, JSON_MEDIA_TYPES } from './common/body-parser';
import { cacheControlMiddleware } from './common/cache-control';
import { ContentNegotiationMiddleware } from './common/content-negotiation.middleware';
import { requestIdMiddleware } from './common/request-id';
import { corsOptions, parseCorsOrigins, securityHeadersMiddleware, trustProxySetting } from './common/security';
import type { AppConfig } from './config/config';
import { EnvConfigError } from './config/env.schema';
import { setupSwagger } from './openapi/swagger';

/** Nest registriert keinen eigenen Body-Parser; den JSON-Parser mit Limit setzt `configureApp`. */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/**
 * Gemeinsame Einrichtung für `main.ts` und die e2e-Tests (vor `init`/`listen`), Werte aus dem `ConfigService`
 * (03 B4.8; Tests ersetzen ihn per `overrideProvider`). Express: kein `X-Powered-By`, `trust proxy` aus
 * `TRUST_PROXY`. Reihenfolge der Middleware nach 03 B4.3:
 * 1. Sicherheitsheader (`helmet`, CSP für JSON bzw. für die Swagger UI),
 * 2. CORS **nur** bei gesetztem `CORS_ORIGINS` (Freigabeliste), sonst kein CORS-Header,
 * 3. `X-Request-Id` für jede Antwort,
 * 4. `Cache-Control` für `GET` (03 B4.5; den `ETag` setzt Express),
 * 5. `ContentNegotiationMiddleware` (406/415) vor dem Parsen (`/api/docs*` nur mit Swagger ausgenommen),
 * 6. JSON-Parser mit 64 KB Limit (nur `application/json` und `application/merge-patch+json`),
 * 7. Parser-Fehler (413, kaputtes JSON) als `ApiException` an den globalen `ApiExceptionFilter`,
 * 8. nur bei `SWAGGER_ENABLED=true`: Swagger UI `/api/docs` und `/api/docs-json` (03 B3.7); sonst 404 (B3.3).
 * Danach folgen Guards (Throttler, JWT, Rollen), Pipes und Controller von Nest.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get<AppConfig>(ConfigService);
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });

  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  try {
    app.set('trust proxy', trustProxySetting(config.get('TRUST_PROXY', { infer: true })));
  } catch {
    throw new EnvConfigError(['TRUST_PROXY'], ['TRUST_PROXY ist ungültig (erlaubt: true, false, Anzahl, loopback, IP oder CIDR)']);
  }

  app.use(securityHeadersMiddleware(swaggerEnabled));
  const origins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
  if (origins.length > 0) app.enableCors(corsOptions(origins));

  const negotiation = new ContentNegotiationMiddleware(swaggerEnabled);
  app.use(requestIdMiddleware);
  app.use(cacheControlMiddleware);
  app.use(negotiation.use.bind(negotiation));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT, type: JSON_MEDIA_TYPES });
  app.use(bodyParserErrorMiddleware);
  if (swaggerEnabled) setupSwagger(app);
  return app;
}
