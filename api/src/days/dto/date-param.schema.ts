import { z } from 'zod';
import { IsoDateSchema } from '../../common/dto/iso-date.schema';

/** `GET /api/days/:date` (R01, US02-2/-3). Die Zukunftssperre (R02, US02-4) prüft `DaysService`. */
export const DateParamSchema = z.object({ date: IsoDateSchema }).strict();

export type DateParam = z.infer<typeof DateParamSchema>;
