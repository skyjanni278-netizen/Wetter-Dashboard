import { z } from 'zod';
import { addDays, isIsoDate } from '../../common/berlin-time';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';

/** Höchste Spanne einer Tagesliste in Tagen, `from` und `to` mitgezählt (R23, US04-7). */
export const MAX_LIST_DAYS = 366;

/**
 * Query von `GET /api/days?from&to` (R23, US04-2/-7/-9). Beide Pflicht, Kalendertag wie R01, `.strict()`
 * gegen unbekannte Parameter (R22, auch `sort`: die Liste ist fest aufsteigend sortiert, B3.1).
 * `from ≤ to` (`to_before_from`) und die Spanne (`range_too_long`) stehen am Feld `to`.
 * „`to` nicht nach heute“ (R02 → `DATE_IN_FUTURE`) prüft `DaysService` mit der `Clock`.
 */
export const DaysQuerySchema = z
  .object({
    from: IsoDateSchema.describe('Erster Berliner Kalendertag (YYYY-MM-DD)'),
    to: IsoDateSchema.describe(`Letzter Berliner Kalendertag (YYYY-MM-DD), höchstens heute; höchstens ${MAX_LIST_DAYS} Tage`),
  })
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
    } else if (value.to > addDays(value.from, MAX_LIST_DAYS - 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Der Zeitraum darf höchstens ${MAX_LIST_DAYS} Tage umfassen.`,
        params: { code: 'range_too_long' },
      });
    }
  });

export type DaysQuery = z.infer<typeof DaysQuerySchema>;
