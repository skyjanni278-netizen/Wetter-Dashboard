import { z } from 'zod';
import { addDays, isIsoDate } from '../../common/berlin-time';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';
import { PAGE_QUERY_FIELDS } from '../../common/dto/page-query.schema';

/** Höchste Spanne der Übersicht in Tagen, `from` und `to` mitgezählt (R23, wie `/days`). */
export const MAX_CORRECTION_DAYS = 366;

/**
 * Query von `GET /api/corrections?from&to&page&limit` (US13-14/-15, R23, R24). `from`/`to` = Berliner
 * Kalendertage von `correctedAt`, beide Pflicht; `to_before_from` und `range_too_long` am Feld `to`; `page`,
 * `limit` wie bei `/imports` (`limit` 1–100). `.strict()` (R22, auch kein `sort`: fest nach `correctedAt`
 * absteigend). „`to` nicht nach heute“ (R02 → `DATE_IN_FUTURE`) prüft der `CorrectionsService`.
 */
export const CorrectionsQuerySchema = z
  .object({
    from: IsoDateSchema.describe('Erster Berliner Kalendertag von correctedAt (YYYY-MM-DD)'),
    to: IsoDateSchema.describe(
      `Letzter Berliner Kalendertag von correctedAt (YYYY-MM-DD), höchstens heute; höchstens ${MAX_CORRECTION_DAYS} Tage`,
    ),
    ...PAGE_QUERY_FIELDS,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isIsoDate(String(value.from)) || !isIsoDate(String(value.to))) return;
    if (value.to < value.from) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
        params: { code: 'to_before_from' },
      });
    } else if (value.to > addDays(value.from, MAX_CORRECTION_DAYS - 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Der Zeitraum darf höchstens ${MAX_CORRECTION_DAYS} Tage umfassen.`,
        params: { code: 'range_too_long' },
      });
    }
  });

export type CorrectionsQuery = z.infer<typeof CorrectionsQuerySchema>;
