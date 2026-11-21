import { z } from 'zod';
import { IMPORT_KINDS, IMPORT_STATUSES } from '../import';

/** Standard und Grenzen der Pagination (R24). */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Query von `GET /api/imports?status&kind&page&limit` (US11-2/-4, R24). `.strict()` (R22, auch kein
 * `sort`: die Liste ist fest nach `requestedAt` absteigend sortiert, B3.1). Zahlen aus dem Query-String
 * über `z.coerce.number().int()` (03 B4.2); `page` ≥ 1 (Standard 1), `limit` 1…100 (Standard 20).
 */
export const ImportsQuerySchema = z
  .object({
    status: z
      .enum(IMPORT_STATUSES, { error: `Erlaubt sind nur die Status ${IMPORT_STATUSES.join(', ')}.` })
      .optional()
      .describe('Nur Importe mit diesem Status'),
    kind: z
      .enum(IMPORT_KINDS, { error: `Erlaubt sind nur die Arten ${IMPORT_KINDS.join(', ')}.` })
      .optional()
      .describe('Nur Importe dieser Art'),
    page: z.coerce
      .number({ error: 'Die Seite muss eine ganze Zahl ab 1 sein.' })
      .int({ error: 'Die Seite muss eine ganze Zahl ab 1 sein.' })
      .min(1, { error: 'Die Seite muss eine ganze Zahl ab 1 sein.' })
      .default(DEFAULT_PAGE)
      .describe(`Seite ab 1 (Standard ${DEFAULT_PAGE})`),
    limit: z.coerce
      .number({ error: `Das Limit muss eine ganze Zahl von 1 bis ${MAX_LIMIT} sein.` })
      .int({ error: `Das Limit muss eine ganze Zahl von 1 bis ${MAX_LIMIT} sein.` })
      .min(1, { error: `Das Limit muss eine ganze Zahl von 1 bis ${MAX_LIMIT} sein.` })
      .max(MAX_LIMIT, { error: `Das Limit muss eine ganze Zahl von 1 bis ${MAX_LIMIT} sein.` })
      .default(DEFAULT_LIMIT)
      .describe(`Einträge je Seite, 1 bis ${MAX_LIMIT} (Standard ${DEFAULT_LIMIT})`),
  })
  .strict();

export type ImportsQuery = z.infer<typeof ImportsQuerySchema>;
