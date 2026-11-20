import { z } from 'zod';

/**
 * Query von `GET /api/forecasts` (R22, US03-3): bisher kein Parameter erlaubt, jeder unbekannte
 * → 400 `unrecognized_keys` mit `field` = Name des Parameters.
 */
export const ForecastsQuerySchema = z.object({}).strict();

export type ForecastsQuery = z.infer<typeof ForecastsQuerySchema>;
