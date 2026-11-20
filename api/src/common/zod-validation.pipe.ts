import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiValidationException } from './api-validation.exception';

/** Deutsche Zod-Meldungen als Rückfall; Meldungen im Schema (`error`) haben Vorrang. */
const GERMAN_ERRORS = z.locales.de().localeError;

/**
 * Prüft Body, Query oder Pfadparameter mit einem Zod-Schema (03 B4.2) und gibt die geprüften
 * (ggf. umgewandelten) Daten zurück. Fehler → 400 `VALIDATION_FAILED` mit `errors[]` je Feld.
 * Verwendung: `@Param(new ZodValidationPipe(DateParamSchema)) { date }: DateParam`.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value, { error: GERMAN_ERRORS });
    if (!result.success) {
      throw ApiValidationException.fromZod(result.error);
    }
    return result.data;
  }
}
