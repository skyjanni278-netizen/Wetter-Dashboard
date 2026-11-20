import { z } from 'zod';

/** Pfadparameter `:id`: positive ganze Zahl als Text (ohne Vorzeichen, Leerzeichen, Exponent), Ausgabe `number`. */
export const IdParamSchema = z
  .object({
    id: z
      .string()
      .regex(/^[1-9]\d{0,9}$/, { error: 'Die ID muss eine positive ganze Zahl sein.' })
      .transform(Number),
  })
  .strict();

export type IdParam = z.infer<typeof IdParamSchema>;
