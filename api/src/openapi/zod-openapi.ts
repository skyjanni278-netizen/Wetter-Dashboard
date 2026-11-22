import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { statusText } from '../common/api-error';

/**
 * Zod → OpenAPI (03 B3.7, S5): Die Schemas der Dokumentation entstehen aus den Zod-Schemas über
 * `z.toJSONSchema()` (Ziel OpenAPI 3.0), es gibt keine zweite, handgeschriebene Fassung. Eingaben
 * (Pfad, Query, Body) mit `io: "input"` (Form vor `transform`/`coerce`), Antworten mit `io: "output"`.
 * `refine`/`superRefine` (z. B. `from ≤ to`, Kalendertag) kann JSON Schema nicht ausdrücken; diese Regeln
 * stehen in der Beschreibung des Felds bzw. in den 400-Antworten.
 */
export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    // `.int()` setzt die Grenzen von `Number.MAX_SAFE_INTEGER`; sie sagen nichts aus und werden weggelassen.
    override: ({ jsonSchema }) => {
      if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
      if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
    },
  }) as Record<string, unknown>;
  delete json['$schema'];
  return json as SchemaObject;
}

/** Name des Fehlerschemas unter `components.schemas` (B3.3); eingetragen in `setupSwagger`. */
export const API_ERROR_SCHEMA_NAME = 'ApiError';

const API_ERROR_REF = { $ref: `#/components/schemas/${API_ERROR_SCHEMA_NAME}` };

/** Eigenschaften eines Objekt-Schemas (Pfad oder Query) mit Pflichtangabe. */
function propertiesOf(schema: z.ZodObject): { name: string; required: boolean; schema: SchemaObject }[] {
  const json = toOpenApiSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    required: required.has(name),
    schema: property as SchemaObject,
  }));
}

/** Query-Parameter aus einem `.strict()`-Query-Schema (R22: andere Parameter → 400 `unrecognized_keys`). */
export function ApiZodQuery(schema: z.ZodObject): MethodDecorator {
  return applyDecorators(
    ...propertiesOf(schema).map(p =>
      ApiQuery({ name: p.name, required: p.required, schema: p.schema, description: p.schema.description }),
    ),
  );
}

/** Pfadparameter aus einem Param-Schema (`DateParamSchema`, `IdParamSchema` …). */
export function ApiZodParams(schema: z.ZodObject): MethodDecorator {
  return applyDecorators(
    ...propertiesOf(schema).map(p =>
      ApiParam({ name: p.name, required: true, schema: p.schema, description: p.schema.description }),
    ),
  );
}

/** Body aus einem Zod-Schema (`application/json`). */
export function ApiZodBody(schema: z.ZodType, description?: string): MethodDecorator {
  return ApiBody({ schema: toOpenApiSchema(schema, 'input'), description });
}

/** Erfolgsantwort mit dem Schema der Antwort (Zod, `io: "output"`). */
export function ApiZodResponse(status: number, schema: z.ZodType, description: string): MethodDecorator {
  return ApiResponse({ status, description, schema: toOpenApiSchema(schema, 'output') });
}

/**
 * Fehlerantworten eines Endpunkts, alle mit dem Fehlerschema aus B3.3 (`ApiError`). 406 (Accept ohne
 * JSON, B3.1) und 500 gelten für jeden Endpunkt und kommen immer dazu; sonst Status → Beschreibung
 * mit den möglichen `code`-Werten.
 */
export function ApiErrors(errors: Record<number, string> = {}): MethodDecorator {
  const all: Record<number, string> = {
    ...errors,
    406: errors[406] ?? 'NOT_ACCEPTABLE: `Accept` erlaubt kein `application/json`',
    500: errors[500] ?? 'INTERNAL_ERROR: unerwarteter Fehler, ohne Details',
  };
  return applyDecorators(
    ...Object.entries(all).map(([status, description]) =>
      ApiResponse({ status: Number(status), description: `${statusText(Number(status))}. ${description}`, schema: API_ERROR_REF }),
    ),
  );
}

/**
 * Geschützter Endpunkt (03 B4.7): Schloss in der Swagger UI (`security: [{ bearer: [] }]`, Schema aus
 * `addBearerAuth()`), die 401- und (seit Schritt 11, `RolesGuard`) die 403-Antwort. An Controller oder Handler
 * mit `@Roles(...)`.
 */
export function ApiBearer(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiBearerAuth(),
    ApiResponse({
      status: 401,
      description: `${statusText(401)}. UNAUTHENTICATED: Token fehlt, ist ungültig oder abgelaufen`,
      schema: API_ERROR_REF,
    }),
    ApiResponse({
      status: 403,
      description: `${statusText(403)}. FORBIDDEN: Token ohne die nötige Rolle (admin)`,
      schema: API_ERROR_REF,
    }),
  );
}
