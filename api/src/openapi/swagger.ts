import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { SWAGGER_PATH } from './docs-path';
import { ApiErrorSchema } from './response.schemas';
import { API_ERROR_SCHEMA_NAME, toOpenApiSchema } from './zod-openapi';

/**
 * Übergang bis Schritt 11 (dann `EnvSchema`): nur exakt `"true"` schaltet die Doku ein (`TRUE`, `1` usw.
 * bleiben aus, wie bei `SCHEDULER_ENABLED`). Standard aus.
 */
export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SWAGGER_ENABLED'] === 'true';
}

/** OpenAPI-Dokument aus den Controllern; das Fehlerschema (B3.3) steht einmal unter `components.schemas`. */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Wetter-Dashboard Heubach API')
    .setDescription(
      'Wetterdaten für Heubach (Europe/Berlin). Alle Fehler im Format `ApiError` (B3.3). ' +
        'Listen sind fest sortiert, unbekannte Query-Parameter ergeben 400 `unrecognized_keys`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      [API_ERROR_SCHEMA_NAME]: toOpenApiSchema(ApiErrorSchema) as SchemaObject,
    },
  };
  return document;
}

/** Richtet `/api/docs` und `/api/docs-json` ein (vor `init`/`listen`, aufgerufen von `configureApp`). */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app));
}
