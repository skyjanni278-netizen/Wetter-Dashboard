import { BadRequestException } from '@nestjs/common';
import { isIsoDate } from '../common/berlin-time';

/** Über HTTP erlaubte Arten (US10-8: `scheduled` und `legacy` nicht). */
export type CreateImportKind = 'range' | 'gaps';

export interface CreateImportInput {
  kind: CreateImportKind;
  from: string;
  to: string;
}

/**
 * Minimale Prüfung des Bodys von `POST /api/imports` (Schritt 3). Die vollständige Prüfung mit Zod
 * (`.strict()`, Reihenfolge, Zukunft, Höchstdauer, Feldfehler; US10-4 bis -8) folgt in Schritt 4.
 */
export function parseCreateImportBody(body: unknown): CreateImportInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Der Body muss ein JSON-Objekt sein');
  }
  const { kind, from, to } = body as Record<string, unknown>;
  if (kind !== 'range' && kind !== 'gaps') {
    throw new BadRequestException('kind muss "range" oder "gaps" sein');
  }
  if (typeof from !== 'string' || !isIsoDate(from)) {
    throw new BadRequestException('from muss ein Datum im Format YYYY-MM-DD sein');
  }
  if (typeof to !== 'string' || !isIsoDate(to)) {
    throw new BadRequestException('to muss ein Datum im Format YYYY-MM-DD sein');
  }
  return { kind, from, to };
}
