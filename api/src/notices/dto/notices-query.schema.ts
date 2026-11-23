import { z } from 'zod';

/**
 * Query von `GET /api/notices` (R22, US20-5): kein Parameter erlaubt (die Hinweise gelten immer für die
 * gespeicherte Vorhersage ab heute), jeder unbekannte → 400 `unrecognized_keys` mit `field` = Name des Parameters.
 */
export const NoticesQuerySchema = z.object({}).strict();

export type NoticesQuery = z.infer<typeof NoticesQuerySchema>;
