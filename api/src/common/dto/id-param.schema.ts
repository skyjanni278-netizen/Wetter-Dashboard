import { z } from 'zod';

/** Größte ID: SQLite-`INTEGER`-Spalten der App bleiben im Bereich eines 32-Bit-`int` (Notiz Schritt 4). */
export const MAX_ID = 2_147_483_647;

/**
 * Eine ID im Pfad: positive ganze Zahl als Text (ohne Vorzeichen, Leerzeichen, Exponent), höchstens `MAX_ID`,
 * Ausgabe `number`. Auch für weitere IDs im Pfad (`:correctionId`, Schritt 12a).
 */
export const IdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, { error: 'Die ID muss eine positive ganze Zahl sein.' })
  .transform(Number)
  .pipe(z.number().max(MAX_ID, { error: `Die ID darf höchstens ${MAX_ID} sein.` }));

/** Pfadparameter `:id` (`IdSchema`). */
export const IdParamSchema = z.object({ id: IdSchema }).strict();

export type IdParam = z.infer<typeof IdParamSchema>;
