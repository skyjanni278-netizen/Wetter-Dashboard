import { z } from 'zod';
import { ReasonSchema } from './observation-patch.schema';

/** Body von `POST /api/observations/:id/corrections/:correctionId/reversal` (R33, US13-16/-18): nur `reason`. */
export const ReversalSchema = z
  .object({ reason: ReasonSchema }, { error: 'Der Body muss ein JSON-Objekt sein.' })
  .strict();

export type Reversal = z.infer<typeof ReversalSchema>;
