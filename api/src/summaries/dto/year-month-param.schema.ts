import { z } from 'zod';

/** R04: Monat `YYYY-MM` mit Monat 01–12 (`2025-00`, `2025-13`, `2025-3` ungültig). */
export const YearMonthSchema = z
  .string({ error: 'Bitte einen Monat im Format JJJJ-MM angeben.' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Bitte einen Monat im Format JJJJ-MM (01–12) angeben.' });

/**
 * `GET /api/summaries/months/:yearMonth` (US04-3, Endpunkt ab Schritt 8). Laufender Monat gültig,
 * späterer Monat → `DATE_IN_FUTURE` und Monat ohne Daten → 404 prüft der Service (R02, R03).
 */
export const YearMonthParamSchema = z.object({ yearMonth: YearMonthSchema }).strict();

export type YearMonthParam = z.infer<typeof YearMonthParamSchema>;
