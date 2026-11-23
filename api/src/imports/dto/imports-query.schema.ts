import { z } from 'zod';
import { PAGE_QUERY_FIELDS } from '../../common/dto/page-query.schema';
import { IMPORT_KINDS, IMPORT_STATUSES } from '../import';

/** Standard und Grenzen der Pagination (R24); seit Schritt 12a gemeinsam mit `/corrections`. */
export { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../../common/dto/page-query.schema';

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
    ...PAGE_QUERY_FIELDS,
  })
  .strict();

export type ImportsQuery = z.infer<typeof ImportsQuerySchema>;
