import { z } from 'zod';
import { addDays, isIsoDate } from '../../common/berlin-time';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';

/**
 * Höchste Spanne einer Lückenliste in Tagen, `from` und `to` mitgezählt. Gleich der Höchstdauer eines
 * Imports (R18, `MAX_IMPORT_DAYS`; hier als Wert, weil Observations das Imports-Modul nicht kennt): Die Liste
 * dient dazu, einen `gaps`-Import anzustoßen. Mehr als die 366 Tage aus R23 sind
 * nötig, weil US17-2 die Lücken vom Datenbeginn bis heute zählt.
 */
export const MAX_GAP_DAYS = 1096;

/**
 * Query von `GET /api/gaps?from&to` nach dem Muster von R23 (US12-1/-2): beide Pflicht, Kalendertag wie R01,
 * `.strict()` gegen unbekannte Parameter (R22). `from ≤ to` (`to_before_from`) und die Spanne
 * (`range_too_long`) stehen am Feld `to`. „`to` nicht nach heute“ (R02) prüft der `GapsService`.
 */
export const GapsQuerySchema = z
  .object({
    from: IsoDateSchema.describe('Erster Berliner Kalendertag (YYYY-MM-DD)'),
    to: IsoDateSchema.describe(`Letzter Berliner Kalendertag (YYYY-MM-DD), höchstens heute; höchstens ${MAX_GAP_DAYS} Tage`),
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
    } else if (value.to > addDays(value.from, MAX_GAP_DAYS - 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Der Zeitraum darf höchstens ${MAX_GAP_DAYS} Tage umfassen.`,
        params: { code: 'range_too_long' },
      });
    }
  });

export type GapsQuery = z.infer<typeof GapsQuerySchema>;
