import type { Notice } from '../models/api';
import { NOTICE_DISCLAIMER, noticeDayLabel, noticeText, noticeValueText } from './forecast-notice';

/** Schmales geschütztes Leerzeichen vor der Einheit (UNIT_SEPARATOR). */
const NNBSP = ' ';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: '2026-11-21-frost', type: 'frost', date: '2026-11-21', value: -2.3, threshold: 0, comparator: 'lt', unit: '°C',
    ...overrides,
  };
}

describe('forecast-notice (US20-6, N07)', () => {
  it('fester Text ohne amtlichen Anspruch', () => {
    expect(NOTICE_DISCLAIMER).toBe('Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst');
  });

  it('Frost: „Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C“ mit echtem Minuszeichen', () => {
    expect(noticeText(notice())).toBe(`Frost möglich am Samstag, 21.11.: Tiefstwert −2,3${NNBSP}°C`);
  });

  it('Hitze und Starkregen im selben Muster, Einheit aus der API', () => {
    expect(noticeText(notice({ id: '2026-07-02-heat', type: 'heat', date: '2026-07-02', value: 30, threshold: 30, comparator: 'gte' })))
      .toBe(`Hitze möglich am Donnerstag, 02.07.: Höchstwert 30,0${NNBSP}°C`);
    expect(noticeText(notice({ type: 'heavy_rain', date: '2026-11-23', value: 24.5, threshold: 20, comparator: 'gte', unit: 'mm' })))
      .toBe(`Starkregen möglich am Montag, 23.11.: Niederschlag 24,5${NNBSP}mm`);
  });

  it('Wochentag nach Kalendertag, unabhängig von der Zeitzone (Sommerzeit-Ende 25.10.2026 = Sonntag)', () => {
    expect(noticeDayLabel('2026-10-25')).toBe('Sonntag, 25.10.');
    expect(noticeDayLabel('kein-datum')).toBe('kein-datum');
  });

  it('Wert: eine Nachkommastelle, nie „−0,0“', () => {
    expect(noticeValueText(-0.1, '°C')).toBe(`−0,1${NNBSP}°C`);
    expect(noticeValueText(-0.04, '°C')).toBe(`0,0${NNBSP}°C`);
    expect(noticeValueText(20, 'mm')).toBe(`20,0${NNBSP}mm`);
  });
});
