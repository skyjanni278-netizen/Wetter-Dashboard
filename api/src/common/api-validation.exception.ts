import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';
import { formatDateDe } from './api-error';
import type { ApiErrorCode, ApiErrorPayload, ApiFieldError } from './api-error';

export const VALIDATION_FAILED_MESSAGE = 'Die Anfrage enthält ungültige Werte.';

/** Feldpfad als Text (`a.b.0`), leerer Pfad = `null` (Fehler am ganzen Objekt, B3.3). */
function fieldOf(path: readonly PropertyKey[]): string | null {
  return path.length === 0 ? null : path.map(String).join('.');
}

/**
 * Feldcode eines Zod-Problems: eigener Code aus `params.code` (z. B. `to_before_from`), ein
 * ungültiges ISO-Datum immer `invalid_date` (R01), sonst der Zod-Code.
 */
function codeOf(issue: z.core.$ZodIssue): string {
  if (issue.code === 'custom') {
    const own = (issue.params as { code?: unknown } | undefined)?.code;
    return typeof own === 'string' ? own : 'custom';
  }
  if (issue.code === 'invalid_format' && issue.format === 'date') {
    return 'invalid_date';
  }
  return issue.code;
}

/**
 * 400 mit `errors[]` je Feld (03 B3.3). Der Body hat schon die Form aus B3.3; `path`, `timestamp`
 * und `requestId` ergänzt der globale `ApiExceptionFilter`.
 */
export class ApiValidationException extends BadRequestException {
  constructor(
    readonly errors: ApiFieldError[],
    options: { code?: ApiErrorCode; message?: string; details?: Record<string, unknown> | null } = {},
  ) {
    const body: ApiErrorPayload = {
      statusCode: 400,
      error: 'Bad Request',
      code: options.code ?? 'VALIDATION_FAILED',
      message: options.message ?? VALIDATION_FAILED_MESSAGE,
      errors,
      details: options.details ?? null,
    };
    super(body);
  }

  /**
   * Ein Eintrag je Feld (das erste Problem gewinnt). Bei `unrecognized_keys` entsteht je
   * unbekanntem Schlüssel ein eigener Eintrag mit `field` = Schlüssel (B3.3, US09-5).
   */
  static fromZod(error: z.ZodError): ApiValidationException {
    const errors: ApiFieldError[] = [];
    const seen = new Set<string | null>();
    const add = (entry: ApiFieldError): void => {
      if (seen.has(entry.field)) return;
      seen.add(entry.field);
      errors.push(entry);
    };
    for (const issue of error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          add({
            field: fieldOf([...issue.path, key]),
            code: 'unrecognized_keys',
            message: `Das Feld „${key}“ ist nicht erlaubt.`,
          });
        }
        continue;
      }
      add({ field: fieldOf(issue.path), code: codeOf(issue), message: issue.message });
    }
    return new ApiValidationException(errors);
  }

  /** R02: Datum nach dem heutigen Berliner Tag → 400 `DATE_IN_FUTURE` mit Fehler am Feld. */
  static dateInFuture(field: string, today: string): ApiValidationException {
    const message = `Das Datum liegt in der Zukunft. Erlaubt ist höchstens heute (${formatDateDe(today)}).`;
    return new ApiValidationException([{ field, code: 'too_big', message }], {
      code: 'DATE_IN_FUTURE',
      message,
    });
  }
}

/** R02 (Service, mit `Clock`): wirft `DATE_IN_FUTURE`, wenn `date` nach `today` liegt (beides `YYYY-MM-DD`). */
export function assertNotInFuture(field: string, date: string, today: string): void {
  if (date > today) {
    throw ApiValidationException.dateInFuture(field, today);
  }
}
