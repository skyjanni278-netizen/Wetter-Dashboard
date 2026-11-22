import {
  IMPORT_STATUS_LABEL, IMPORT_STATUS_VARIANT, formatDateTimeBerlin, formatLocalDateTime, formatPeriod, hoursLabel,
  isActiveImport, isImportStatus, parseImportId, parsePageParam, runningImportIdOf,
} from './admin-format';
import { apiErrorBody } from '../testing/admin-fixtures';

describe('admin-format', () => {
  it('Status-Chips: „Läuft“, „OK“, „Fehler“ (E3.7.5) mit Statusfarbe nur bei OK und Fehler', () => {
    expect(IMPORT_STATUS_LABEL).toEqual({
      queued: 'Wartet', running: 'Läuft', succeeded: 'OK', partial: 'Mit Warnungen', failed: 'Fehler',
    });
    expect(IMPORT_STATUS_VARIANT.succeeded).toBe('success');
    expect(IMPORT_STATUS_VARIANT.failed).toBe('danger');
    expect(IMPORT_STATUS_VARIANT.running).toBe('status');
  });

  it('isActiveImport: nur queued und running (R19)', () => {
    expect(['queued', 'running', 'succeeded', 'partial', 'failed'].map(s => isActiveImport(s as never)))
      .toEqual([true, true, false, false, false]);
  });

  it('isImportStatus erkennt nur die fünf Status', () => {
    expect(isImportStatus('failed')).toBe(true);
    expect(isImportStatus('done')).toBe(false);
    expect(isImportStatus(undefined)).toBe(false);
  });

  it.each([
    [undefined, 1], ['', 1], ['1', 1], ['2', 2], ['17', 17], ['0', 1], ['-1', 1], ['1.5', 1], ['abc', 1], ['02', 1], ['1e3', 1],
    ['9999999', 1],
  ])('parsePageParam(%j) → %i (ungültig → Seite 1)', (value, expected) => {
    expect(parsePageParam(value)).toBe(expected);
  });

  it.each([
    ['12', 12], ['1', 1], ['0', null], ['-3', null], ['abc', null], ['1.5', null], [undefined, null], ['99999999999999999', null],
  ])('parseImportId(%j) → %j', (value, expected) => {
    expect(parseImportId(value)).toBe(expected);
  });

  it('formatDateTimeBerlin: UTC als Berliner Ortszeit (Winter +1, Sommer +2), fehlend „–“', () => {
    expect(formatDateTimeBerlin('2026-11-22T13:05:00Z')).toBe('22.11.2026, 14:05');
    expect(formatDateTimeBerlin('2026-07-01T22:30:00Z')).toBe('02.07.2026, 00:30');
    expect(formatDateTimeBerlin(null)).toBe('–');
    expect(formatDateTimeBerlin('kaputt')).toBe('kaputt');
  });

  it('formatLocalDateTime: Ortszeit mit Offset ohne Umrechnung', () => {
    expect(formatLocalDateTime('2026-11-12T04:00:00+01:00')).toBe('12.11.2026, 04:00');
    expect(formatLocalDateTime('2026-03-29T03:00:00+02:00')).toBe('29.03.2026, 03:00');
  });

  it('formatPeriod: Zeitraum, ein Tag einmal, ohne Zeitraum „–“', () => {
    expect(formatPeriod('2026-10-01', '2026-10-31')).toBe('01.10.2026 – 31.10.2026');
    expect(formatPeriod('2026-10-01', '2026-10-01')).toBe('01.10.2026');
    expect(formatPeriod(null, null)).toBe('–');
  });

  it('runningImportIdOf: nur bei IMPORT_RUNNING mit positiver Zahl', () => {
    expect(runningImportIdOf(apiErrorBody(409, 'IMPORT_RUNNING', 'x', [], { runningImportId: 42 }))).toBe(42);
    expect(runningImportIdOf(apiErrorBody(409, 'IMPORT_RUNNING', 'x', [], null))).toBeNull();
    expect(runningImportIdOf(apiErrorBody(409, 'IMPORT_RUNNING', 'x', [], { runningImportId: '42' }))).toBeNull();
    expect(runningImportIdOf(apiErrorBody(409, 'CONFLICT', 'x', [], { runningImportId: 42 }))).toBeNull();
  });

  it('hoursLabel: Einzahl und Mehrzahl', () => {
    expect(hoursLabel(1)).toBe('1 Stunde');
    expect(hoursLabel(27)).toBe('27 Stunden');
    expect(hoursLabel(1200)).toBe('1.200 Stunden');
  });
});
