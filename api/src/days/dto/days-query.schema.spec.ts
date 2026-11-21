import { ApiValidationException } from '../../common/api-validation.exception';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DaysQuerySchema, MAX_LIST_DAYS } from './days-query.schema';

function errorsOf(value: unknown) {
  const result = DaysQuerySchema.safeParse(value);
  return result.success ? [] : ApiValidationException.fromZod(result.error).errors;
}

describe('DaysQuerySchema (R23, US04-2/-7/-9)', () => {
  it('366 ist die Grenze (beide Tage mitgezählt, wie R18)', () => {
    expect(MAX_LIST_DAYS).toBe(366);
  });

  it.each([
    ['1 Tag (from = to)', '2026-11-19', '2026-11-19'],
    ['ein Monat', '2025-03-01', '2025-03-31'],
    ['365 Tage', '2025-01-01', '2025-12-31'],
    ['366 Tage (Schaltjahr)', '2024-01-01', '2024-12-31'],
    ['366 Tage über den Jahreswechsel', '2025-01-01', '2026-01-01'],
  ])('%s ist gültig', (_name, from, to) => {
    expect(DaysQuerySchema.parse({ from, to })).toEqual({ from, to });
  });

  it.each([
    ['367 Tage', '2024-01-01', '2025-01-01'],
    ['367 Tage ohne Schalttag', '2025-01-01', '2026-01-02'],
    ['US04-7', '2025-01-01', '2026-11-19'],
  ])('%s → range_too_long am Feld to', (_name, from, to) => {
    expect(errorsOf({ from, to })).toEqual([
      { field: 'to', code: 'range_too_long', message: 'Der Zeitraum darf höchstens 366 Tage umfassen.' },
    ]);
  });

  it('from > to → to_before_from am Feld to', () => {
    expect(errorsOf({ from: '2026-11-19', to: '2026-11-18' })).toEqual([
      { field: 'to', code: 'to_before_from', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' },
    ]);
  });

  it('to fehlt → Fehler am Feld to (Pflicht)', () => {
    expect(errorsOf({ from: '2026-11-01' })).toEqual([
      { field: 'to', code: 'invalid_type', message: 'Bitte ein Datum angeben.' },
    ]);
  });

  it('beide fehlen → je ein Fehler an from und to', () => {
    expect(errorsOf({}).map(e => [e.field, e.code])).toEqual([
      ['from', 'invalid_type'],
      ['to', 'invalid_type'],
    ]);
  });

  it.each(['2026-02-29', '2026-11-1', 'heute', ''])('from = %j → invalid_date (R01), kein Vergleich', from => {
    expect(errorsOf({ from, to: '2026-11-19' })).toEqual([
      { field: 'from', code: 'invalid_date', message: 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.' },
    ]);
  });

  it('mehrfacher Parameter (?to=a&to=b, Array) → Fehler am Feld to', () => {
    expect(errorsOf({ from: '2026-11-01', to: ['2026-11-02', '2026-11-03'] }).map(e => e.field)).toEqual(['to']);
  });

  it('unbekannter Parameter (sort, R22) → unrecognized_keys', () => {
    expect(errorsOf({ from: '2026-11-01', to: '2026-11-19', sort: 'desc' })).toEqual([
      { field: 'sort', code: 'unrecognized_keys', message: 'Das Feld „sort“ ist nicht erlaubt.' },
    ]);
  });

  it('über die Pipe: 400 VALIDATION_FAILED', () => {
    const pipe = new ZodValidationPipe(DaysQuerySchema);
    expect(() => pipe.transform({ from: '2026-11-19', to: '2026-11-01' })).toThrow(ApiValidationException);
  });
});
