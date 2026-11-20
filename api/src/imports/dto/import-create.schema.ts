import { z } from 'zod';
import { addDays, isIsoDate } from '../../common/berlin-time';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';

/** Höchste Spanne eines Imports in Tagen, `from` und `to` mitgezählt (R18, US10-6). */
export const MAX_IMPORT_DAYS = 1096;

/**
 * Body von `POST /api/imports` (R18, US10-4/-6/-8). `.strict()` gegen Zusatzfelder.
 * `from ≤ to` (`to_before_from`) und die Spanne (`range_too_long`) stehen am Feld `to`.
 * „`to` nicht nach heute“ (R02, US10-5 → `DATE_IN_FUTURE`) prüft `ImportsService` mit der `Clock`.
 */
export const ImportCreateSchema = z
  .object(
    {
      kind: z.enum(['range', 'gaps'], { error: 'Erlaubt sind nur die Arten „range“ und „gaps“.' }),
      from: IsoDateSchema,
      to: IsoDateSchema,
      overwriteCorrections: z.boolean({ error: 'overwriteCorrections muss true oder false sein.' }).optional(),
    },
    { error: 'Der Body muss ein JSON-Objekt sein.' },
  )
  .strict()
  .superRefine((value, ctx) => {
    // Nur vergleichen, wenn beide Daten gültig sind (sonst steht der Fehler schon am Feld).
    if (!isIsoDate(String(value.from)) || !isIsoDate(String(value.to))) return;
    if (value.to < value.from) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
        params: { code: 'to_before_from' },
      });
    } else if (value.to > addDays(value.from, MAX_IMPORT_DAYS - 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Der Zeitraum darf höchstens ${MAX_IMPORT_DAYS} Tage umfassen.`,
        params: { code: 'range_too_long' },
      });
    }
  });

export type ImportCreateDto = z.infer<typeof ImportCreateSchema>;
