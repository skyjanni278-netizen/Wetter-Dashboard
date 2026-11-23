import { ApiValidationException } from '../../common/api-validation.exception';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { MAX_PERIOD_DAYS, PeriodsQuerySchema } from './periods-query.schema';

function errorsOf(value: unknown) {
  const result = PeriodsQuerySchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('PeriodsQuerySchema (GET /api/summaries/periods, R28, US19-1 bis -6)', () => {
  it('366 ist die Grenze (beide Tage mitgezählt, wie R23)', () => {
    expect(MAX_PERIOD_DAYS).toBe(366);
  });

  it.each([
    ['US19-1', '2025-01-01', '2025-11-18'],
    ['1 Tag (from = to)', '2025-11-18', '2025-11-18'],
    ['366 Tage über den Jahreswechsel (US19-3)', '2025-01-01', '2026-01-01'],
    ['366 Tage (Schaltjahr)', '2028-01-01', '2028-12-31'],
  ])('%s ist gültig', (_name, from, to) => {
    expect(PeriodsQuerySchema.parse({ from, to })).toEqual({ from, to });
  });

  it.each([
    ['367 Tage (US19-3)', '2025-01-01', '2026-01-02'],
    ['367 Tage mit Schalttag', '2028-01-01', '2029-01-01'],
  ])('%s → range_too_long am Feld to', (_name, from, to) => {
    expect(errorsOf({ from, to })).toEqual([
      { field: 'to', code: 'range_too_long', message: 'Der Zeitraum darf höchstens 366 Tage umfassen.' },
    ]);
  });

  it('US19-2: from > to → to_before_from am Feld to', () => {
    expect(errorsOf({ from: '2025-11-18', to: '2025-01-01' })).toEqual([
      { field: 'to', code: 'to_before_from', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' },
    ]);
  });

  it('US19-6: compare=previous → unrecognized_keys am Feld compare (R22)', () => {
    expect(errorsOf({ from: '2025-01-01', to: '2025-11-18', compare: 'previous' })).toEqual([
      { field: 'compare', code: 'unrecognized_keys', message: 'Das Feld „compare“ ist nicht erlaubt.' },
    ]);
  });

  it('beide fehlen → je ein Fehler an from und to', () => {
    expect(errorsOf({}).map(e => [e.field, e.code])).toEqual([
      ['from', 'invalid_type'],
      ['to', 'invalid_type'],
    ]);
  });

  it.each(['2025-02-29', '2025-1-01', '01.01.2025', ''])('from = %j → invalid_date (R01), kein Vergleich', from => {
    expect(errorsOf({ from, to: '2025-11-18' })).toEqual([
      { field: 'from', code: 'invalid_date', message: 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.' },
    ]);
  });

  it('über die Pipe: 400 VALIDATION_FAILED', () => {
    const pipe = new ZodValidationPipe(PeriodsQuerySchema);
    expect(() => pipe.transform({ from: '2025-11-18', to: '2025-01-01' })).toThrow(ApiValidationException);
  });
});
