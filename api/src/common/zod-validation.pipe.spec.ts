import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ApiValidationException, assertNotInFuture } from './api-validation.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

function rejectionOf(schema: z.ZodType, value: unknown): ApiValidationException {
  try {
    new ZodValidationPipe(schema).transform(value);
  } catch (error) {
    if (error instanceof ApiValidationException) return error;
    throw error;
  }
  throw new Error('kein Fehler');
}

describe('ZodValidationPipe und ApiValidationException.fromZod (B3.3)', () => {
  const Schema = z
    .object({
      name: z.string().min(3, { error: 'Mindestens drei Zeichen.' }),
      count: z.number().int(),
      nested: z.object({ value: z.number() }).optional(),
    })
    .strict();

  it('gibt die geprüften (umgewandelten) Daten zurück', () => {
    const pipe = new ZodValidationPipe(z.object({ id: z.string().transform(Number) }));
    expect(pipe.transform({ id: '7' })).toEqual({ id: 7 });
  });

  it('400 mit Body in der Form aus B3.3: VALIDATION_FAILED, errors[], details null', () => {
    const error = rejectionOf(Schema, { name: 'ab', count: 1 });
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'Die Anfrage enthält ungültige Werte.',
      errors: [{ field: 'name', code: 'too_small', message: 'Mindestens drei Zeichen.' }],
      details: null,
    });
  });

  it('unrecognized_keys: je Schlüssel ein Eintrag mit field = Schlüssel (auch verschachtelt)', () => {
    const error = rejectionOf(Schema, { name: 'abc', count: 1, roles: ['admin'], x: 1 });
    expect(error.errors).toEqual([
      { field: 'roles', code: 'unrecognized_keys', message: 'Das Feld „roles“ ist nicht erlaubt.' },
      { field: 'x', code: 'unrecognized_keys', message: 'Das Feld „x“ ist nicht erlaubt.' },
    ]);
    const nested = rejectionOf(z.object({ a: z.object({}).strict() }), { a: { b: 1 } });
    expect(nested.errors).toEqual([{ field: 'a.b', code: 'unrecognized_keys', message: 'Das Feld „b“ ist nicht erlaubt.' }]);
  });

  it('ein Eintrag je Feld: mehrere Probleme am selben Feld → nur das erste', () => {
    const error = rejectionOf(z.object({ v: z.string().min(5).regex(/^\d+$/) }), { v: 'ab' });
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toMatchObject({ field: 'v', code: 'too_small' });
  });

  it('Pfad mit Index als Punktpfad, Fehler am ganzen Objekt mit field = null', () => {
    expect(rejectionOf(z.object({ list: z.array(z.number()) }), { list: [1, 'a'] }).errors[0].field).toBe('list.1');
    expect(rejectionOf(Schema, 'kein Objekt').errors).toEqual([
      { field: null, code: 'invalid_type', message: expect.any(String) },
    ]);
  });

  it('eigener Code über params.code (custom), sonst Zod-Code', () => {
    const own = z.string().refine(() => false, { error: 'nein', params: { code: 'range_too_long' } });
    expect(rejectionOf(z.object({ to: own }), { to: 'x' }).errors).toEqual([
      { field: 'to', code: 'range_too_long', message: 'nein' },
    ]);
    const plain = z.string().refine(() => false, { error: 'nein' });
    expect(rejectionOf(z.object({ to: plain }), { to: 'x' }).errors[0].code).toBe('custom');
  });

  it('Meldungen auf Deutsch, wenn das Schema keine eigene hat', () => {
    const error = rejectionOf(Schema, { name: 'abc' });
    expect(error.errors).toEqual([{ field: 'count', code: 'invalid_type', message: expect.stringMatching(/Ungültige Eingabe/) }]);
  });
});

describe('assertNotInFuture (R02)', () => {
  it('heute und früher erlaubt, später → DATE_IN_FUTURE mit Fehler am Feld', () => {
    expect(() => assertNotInFuture('to', '2026-11-20', '2026-11-20')).not.toThrow();
    expect(() => assertNotInFuture('to', '2025-01-01', '2026-11-20')).not.toThrow();
    let thrown: unknown;
    try {
      assertNotInFuture('to', '2026-11-21', '2026-11-20');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiValidationException);
    expect((thrown as ApiValidationException).getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'DATE_IN_FUTURE',
      message: 'Das Datum liegt in der Zukunft. Erlaubt ist höchstens heute (20.11.2026).',
      errors: [
        { field: 'to', code: 'too_big', message: 'Das Datum liegt in der Zukunft. Erlaubt ist höchstens heute (20.11.2026).' },
      ],
      details: null,
    });
  });
});
