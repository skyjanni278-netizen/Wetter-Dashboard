import { z } from 'zod';
import { YearSchema } from './year-param.schema';

/**
 * Query von `GET /api/summaries/months?year=` (US05-2/-6): `year` Pflicht, Format wie R05 (`YYYY`, ≥ 1940)
 * → `number`, Fehler am Feld `year`. Jahr nach dem laufenden (`DATE_IN_FUTURE`) und Jahr ohne Daten (404)
 * prüft der Service. `.strict()` (R22).
 */
export const MonthsQuerySchema = z
  .object({ year: YearSchema.describe('Jahr YYYY, ab 1940, höchstens das laufende') })
  .strict();

export type MonthsQuery = z.infer<typeof MonthsQuerySchema>;

/** Query von `GET /api/summaries/years` (US04-8): kein Parameter erlaubt (R22). */
export const YearsQuerySchema = z.object({}).strict();

export type YearsQuery = z.infer<typeof YearsQuerySchema>;
