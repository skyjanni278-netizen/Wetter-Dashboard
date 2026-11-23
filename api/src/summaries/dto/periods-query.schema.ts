import { z } from 'zod';
import { addDays, isIsoDate } from '../../common/berlin-time';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';

/** Höchste Spanne eines freien Zeitraums in Tagen, `from` und `to` mitgezählt (R28, wie R23). */
export const MAX_PERIOD_DAYS = 366;

/**
 * Query von `GET /api/summaries/periods?from&to` (R28, US19-1 bis -6). Beide Pflicht, Kalendertag wie R01;
 * `from > to` (`to_before_from`) und mehr als 366 Tage (`range_too_long`) stehen am Feld `to` (US19-2/-3).
 * `.strict()` (R22): jeder weitere Parameter, auch `compare`, → `unrecognized_keys` (US19-6; der Vorjahresvergleich
 * fragt zwei Zeiträume einzeln ab, R29). „`to` nicht nach heute“ (R02 → `DATE_IN_FUTURE`) prüft der `SummariesService`.
 */
export const PeriodsQuerySchema = z
  .object({
    from: IsoDateSchema.describe('Erster Berliner Kalendertag (YYYY-MM-DD)'),
    to: IsoDateSchema.describe(
      `Letzter Berliner Kalendertag (YYYY-MM-DD), höchstens heute; höchstens ${MAX_PERIOD_DAYS} Tage, from = to erlaubt`,
    ),
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
    } else if (value.to > addDays(value.from, MAX_PERIOD_DAYS - 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Der Zeitraum darf höchstens ${MAX_PERIOD_DAYS} Tage umfassen.`,
        params: { code: 'range_too_long' },
      });
    }
  });

export type PeriodsQuery = z.infer<typeof PeriodsQuerySchema>;
