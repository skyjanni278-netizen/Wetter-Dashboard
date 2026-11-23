import { z } from 'zod';

/** Standard und Grenzen der Pagination (R24), gleich für `/imports` und `/corrections`. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const PAGE_MESSAGE = 'Die Seite muss eine ganze Zahl ab 1 sein.';
const LIMIT_MESSAGE = `Das Limit muss eine ganze Zahl von 1 bis ${MAX_LIMIT} sein.`;

/**
 * Felder `page` und `limit` eines Query-Schemas (R24). Zahlen aus dem Query-String über
 * `z.coerce.number().int()` (03 B4.2); `page` ≥ 1 (Standard 1), `limit` 1…100 (Standard 20).
 */
export const PAGE_QUERY_FIELDS = {
  page: z.coerce
    .number({ error: PAGE_MESSAGE })
    .int({ error: PAGE_MESSAGE })
    .min(1, { error: PAGE_MESSAGE })
    .default(DEFAULT_PAGE)
    .describe(`Seite ab 1 (Standard ${DEFAULT_PAGE})`),
  limit: z.coerce
    .number({ error: LIMIT_MESSAGE })
    .int({ error: LIMIT_MESSAGE })
    .min(1, { error: LIMIT_MESSAGE })
    .max(MAX_LIMIT, { error: LIMIT_MESSAGE })
    .default(DEFAULT_LIMIT)
    .describe(`Einträge je Seite, 1 bis ${MAX_LIMIT} (Standard ${DEFAULT_LIMIT})`),
};
