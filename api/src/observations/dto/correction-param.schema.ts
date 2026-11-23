import { z } from 'zod';
import { IdSchema } from '../../common/dto/id-param.schema';

/** Pfadparameter `:id` (Stunde) und `:correctionId` der Rücknahme (R33), beide wie `IdParamSchema`. */
export const CorrectionParamSchema = z.object({ id: IdSchema, correctionId: IdSchema }).strict();

export type CorrectionParam = z.infer<typeof CorrectionParamSchema>;
