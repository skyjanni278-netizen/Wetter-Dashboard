import { z } from 'zod';
import { isIsoDate } from '../berlin-time';

export const INVALID_DATE_MESSAGE = 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.';

/**
 * R01: Kalenderdatum `YYYY-MM-DD`. `z.iso.date()` prüft das Format, die Rückrechnung über
 * `isIsoDate` (Datum → Teile → gleich?) den echten Kalendertag. Feldcode immer `invalid_date`
 * (`ApiValidationException.fromZod`). „Nicht in der Zukunft“ (R02) prüft der Service mit der `Clock`.
 */
export const IsoDateSchema = z
  .iso.date({ error: iss => (iss.input === undefined ? 'Bitte ein Datum angeben.' : INVALID_DATE_MESSAGE) })
  .refine(isIsoDate, { error: INVALID_DATE_MESSAGE, params: { code: 'invalid_date' } });

export type IsoDate = z.infer<typeof IsoDateSchema>;
