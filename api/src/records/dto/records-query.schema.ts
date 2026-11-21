import { z } from 'zod';

/**
 * Query von `GET /api/records` (R22, US06-6): kein Parameter erlaubt (ein Filter nach Jahr ist keine
 * bestehende Funktion), jeder unbekannte → 400 `unrecognized_keys` mit `field` = Name des Parameters.
 */
export const RecordsQuerySchema = z.object({}).strict();

export type RecordsQuery = z.infer<typeof RecordsQuerySchema>;
