import {
  berlinDateTime, delayedText, footerUpdateText, formatUpdateDateTime, formatUpdateTime, hoursSince, neverText, standText,
} from './data-status';
import { statusOf } from '../testing/admin-fixtures';

/** FAKE_NOW der Browser-Prüfungen: 19.11.2026, 14:30 MEZ. */
const NOW = new Date('2026-11-19T13:30:00Z');

describe('data-status (N01, US16-4/-5)', () => {
  it('berlinDateTime: UTC in Berliner Datum und Uhrzeit (MEZ und MESZ)', () => {
    expect(berlinDateTime('2026-11-19T13:05:12Z')).toEqual({ date: '2026-11-19', time: '14:05' });
    expect(berlinDateTime('2026-07-01T22:30:00Z')).toEqual({ date: '2026-07-02', time: '00:30' });
    expect(berlinDateTime(null)).toBeNull();
    expect(berlinDateTime('kaputt')).toBeNull();
  });

  it('formatUpdateTime: am Server-Heute nur die Uhrzeit, sonst mit Datum', () => {
    expect(formatUpdateTime('2026-11-19T13:05:12Z', '2026-11-19')).toBe('14:05 Uhr');
    expect(formatUpdateTime('2026-11-18T22:05:00Z', '2026-11-19')).toBe('18.11.2026, 23:05 Uhr');
    expect(formatUpdateDateTime('2026-11-19T10:05:12Z')).toBe('19.11.2026, 11:05 Uhr');
    expect(formatUpdateDateTime(null)).toBe('–');
  });

  it('standText (US16-4): „Stand: 14:05 Uhr“, mit Scheduler „· nächster Abruf 15:05 Uhr“, ohne Erfolg eigener Text', () => {
    const ok = statusOf({ today: '2026-11-19', lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z', nextScheduledUpdateAt: null });
    expect(standText(ok)).toBe('Stand: 14:05 Uhr');
    expect(standText({ ...ok, nextScheduledUpdateAt: '2026-11-19T14:05:00Z' })).toBe('Stand: 14:05 Uhr · nächster Abruf 15:05 Uhr');
    expect(standText({ ...ok, lastSuccessfulUpdateAt: null, updateState: 'never' })).toBe('Stand: noch keine Aktualisierung');
  });

  it('delayedText (US16-5): „Stand: 19.11.2026, 11:05 Uhr – seit 3 Stunden keine Aktualisierung“ bei 14:30', () => {
    const delayed = statusOf({ today: '2026-11-19', lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' });
    expect(delayedText(delayed, NOW)).toBe('Stand: 19.11.2026, 11:05 Uhr – seit 3 Stunden keine Aktualisierung');
  });

  it('delayedText: passt die Uhr nicht zum Server (anderer Tag als status.today), entfällt die Zahl', () => {
    const delayed = statusOf({ today: '2026-11-19', lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' });
    expect(delayedText(delayed, new Date('2026-11-23T12:00:00Z'))).toBe('Stand: 19.11.2026, 11:05 Uhr – seitdem keine Aktualisierung');
  });

  it('hoursSince: volle Stunden; null bei fremdem Tag oder Uhr vor dem Zeitpunkt', () => {
    expect(hoursSince('2026-11-19T10:05:12Z', { today: '2026-11-19' }, NOW)).toBe(3);
    expect(hoursSince('2026-11-19T12:31:00Z', { today: '2026-11-19' }, NOW)).toBe(0);
    expect(hoursSince('2026-11-19T10:05:12Z', { today: '2026-11-20' }, NOW)).toBeNull();
    expect(hoursSince('2026-11-19T14:00:00Z', { today: '2026-11-19' }, NOW)).toBeNull();
  });

  it('neverText und footerUpdateText', () => {
    expect(neverText({ dataTo: '2026-11-19' })).toBe('Die Daten wurden noch nie automatisch aktualisiert. Gespeichert sind Daten bis 19.11.2026.');
    expect(neverText({ dataTo: null })).toBe('Die Daten wurden noch nie automatisch aktualisiert.');
    expect(footerUpdateText(statusOf({ lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z' }))).toBe('Zuletzt aktualisiert: 19.11.2026, 14:05 Uhr');
    expect(footerUpdateText(statusOf({ lastSuccessfulUpdateAt: null }))).toBe('Noch keine Aktualisierung');
  });
});
