import { hoursInDay, localDateTime } from '../common/berlin-time';
import type { ObservationHour, ObservationSource } from '../observations/observation';
import { AggregationService, daysInMonth, daysInYear, isPredictionHour } from './aggregation.service';
import type { DayAggregate } from './aggregation.service';

const HOUR_MS = 60 * 60 * 1000;
const service = new AggregationService();

type Values = Partial<Omit<ObservationHour, 'timeLocal' | 'timeUtc'>>;

/** `count` Stunden ab `startUtc` mit UTC-Zeitpunkt (wie Importe und Fixtures). */
function utcHours(startUtc: string, count: number, valueOf: (i: number) => Values = () => ({})): ObservationHour[] {
  const start = Date.parse(startUtc);
  return Array.from({ length: count }, (_, i) => {
    const instant = new Date(start + i * HOUR_MS);
    return {
      id: i + 1,
      timeLocal: localDateTime(instant),
      timeUtc: instant.toISOString().replace('.000Z', 'Z'),
      temperature: 10,
      apparentTemperature: 8,
      precipitation: 0,
      weatherCode: 3,
      windSpeed: 12,
      windDirection: 220,
      source: 'archive' as ObservationSource,
      correctedAt: null,
      ...valueOf(i),
    };
  });
}

/** 24 Stunden eines Tages im Altbestand (nur Ortszeit, Herkunft unbekannt). */
function legacyHours(date: string, valueOf: (hour: number) => Values = () => ({})): ObservationHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    id: hour + 1,
    timeLocal: `${date}T${String(hour).padStart(2, '0')}:00`,
    timeUtc: null,
    temperature: 10,
    apparentTemperature: 8,
    precipitation: 0,
    weatherCode: 3,
    windSpeed: 12,
    windDirection: 220,
    source: null,
    correctedAt: null,
    ...valueOf(hour),
  }));
}

/** Vollständiger Berliner Kalendertag (23/24/25 Stunden ab 00:00 Ortszeit) mit UTC-Zeitpunkten. */
function berlinDay(date: string, valueOf: (hour: number) => Values = () => ({})): ObservationHour[] {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const start = [midnight - 2 * HOUR_MS, midnight - HOUR_MS].find(t => localDateTime(new Date(t)) === `${date}T00:00`);
  return utcHours(new Date(start!).toISOString(), hoursInDay(date), valueOf);
}

const NOW = new Date('2026-11-19T13:30:00Z'); // 14:30 MEZ (B1.2)

function day(date: string, hours: ObservationHour[], now = NOW): DayAggregate {
  return service.aggregateDay(date, hours, now);
}

describe('AggregationService: Tagesaggregat', () => {
  describe('R08 / US01-3: Vorhersage gegenüber Vergangenheit (jetzt = 14:30 MEZ)', () => {
    const hours = berlinDay('2026-11-19', h => ({ precipitation: h <= 14 ? 0.1 : 0.6, source: h <= 14 ? 'forecast_api' : 'prediction' }));

    it('Stunden ab 15:00 sind Vorhersage, 14:00 zählt als vergangen', () => {
      const result = day('2026-11-19', hours);
      expect(result.hours.filter(h => h.isPrediction).map(h => h.hour.timeLocal.slice(11))).toEqual([
        '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
      ]);
      expect(result.hoursObserved).toBe(15);
      expect(result.hoursPredicted).toBe(9);
    });

    it('observed.precipitationSum nur bis 14:00, predicted getrennt (F13)', () => {
      const result = day('2026-11-19', hours);
      expect(result.observed.precipitationSum).toBeCloseTo(1.5, 10);
      expect(result.predicted.precipitationSum).toBeCloseTo(5.4, 10);
      expect(result.complete).toBe(false);
      expect(result.observed.isDryDay).toBeNull();
    });

    it('auch ohne gespeicherte Herkunft: Stunde nach „jetzt“ ist Vorhersage (Zeitvergleich)', () => {
      const archive = berlinDay('2026-11-19');
      const result = day('2026-11-19', archive);
      expect(result.hoursObserved).toBe(15);
      expect(result.hours[15].isPrediction).toBe(true);
    });

    it('Grenze: um 15:00:00 ist 15:00 vergangen, um 14:59:59 noch Vorhersage', () => {
      const hour = berlinDay('2026-11-19')[15];
      expect(isPredictionHour(hour, new Date('2026-11-19T14:00:00Z'))).toBe(false);
      expect(isPredictionHour(hour, new Date('2026-11-19T13:59:59Z'))).toBe(true);
    });

    it('Altbestand ohne UTC-Zeitpunkt: Vergleich der Berliner Ortszeit', () => {
      const result = day('2026-11-19', legacyHours('2026-11-19'));
      expect(result.hoursObserved).toBe(15);
      expect(result.hours[14]).toMatchObject({ isPrediction: false });
      expect(result.hours[15]).toMatchObject({ isPrediction: true });
    });

    it('veraltete Vorhersage (source = prediction, Zeit vorbei) zählt nie als Messwert', () => {
      const hours10 = berlinDay('2026-11-10', h => (h === 23 ? { source: 'prediction', precipitation: 9 } : {}));
      const result = day('2026-11-10', hours10);
      expect(result.hoursPredicted).toBe(1);
      expect(result.observed.precipitationSum).toBe(0);
      expect(result.complete).toBe(false);
      expect(result.observed.isDryDay).toBeNull();
    });

    it('US01-6: current ist die jüngste vergangene Stunde von heute (14:00), an anderen Tagen null', () => {
      expect(day('2026-11-19', hours).current?.timeLocal).toBe('2026-11-19T14:00');
      expect(day('2026-11-18', berlinDay('2026-11-18')).current).toBeNull();
    });

    it('US01-2: um 00:30 MEZ ist der 20.11. heute', () => {
      const now = new Date('2026-11-19T23:30:00Z');
      const result = day('2026-11-20', berlinDay('2026-11-20'), now);
      expect(result.isToday).toBe(true);
      expect(result.current?.timeLocal).toBe('2026-11-20T00:00');
    });
  });

  describe('R07: 23- und 25-Stunden-Tage', () => {
    it('29.03.2026: hoursExpected = 23, vollständig mit 23 Stunden', () => {
      const result = day('2026-03-29', utcHours('2026-03-28T23:00:00Z', 23));
      expect(result).toMatchObject({ hoursExpected: 23, hoursObserved: 23, complete: true });
      expect(result.hours.map(h => h.hour.timeLocal)).not.toContain('2026-03-29T02:00');
    });

    it('25.10.2026: hoursExpected = 25, zwei Stunden 02:00, vollständig mit 25 Stunden', () => {
      const result = day('2026-10-25', utcHours('2026-10-24T22:00:00Z', 25));
      expect(result).toMatchObject({ hoursExpected: 25, hoursObserved: 25, complete: true });
      expect(result.hours.filter(h => h.hour.timeLocal === '2026-10-25T02:00')).toHaveLength(2);
    });

    it('25.10.2026 mit nur 24 UTC-Stunden ist unvollständig', () => {
      expect(day('2026-10-25', utcHours('2026-10-24T22:00:00Z', 24)).complete).toBe(false);
    });

    it('Übergang Z1: Altbestandstage mit 24 Ortszeiten gelten am 25.10. und 29.03. als vollständig', () => {
      expect(day('2025-10-26', legacyHours('2025-10-26'))).toMatchObject({ hoursExpected: 25, complete: true });
      expect(day('2026-03-29', legacyHours('2026-03-29'))).toMatchObject({ hoursExpected: 23, hoursObserved: 24, complete: true });
    });
  });

  describe('R09: Trockentag < 0,1 mm', () => {
    it('Summe 0,09 mm → trocken', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10', h => ({ precipitation: h === 3 ? 0.09 : 0 })));
      expect(result.observed.isDryDay).toBe(true);
    });

    it('Summe 0,1 mm → nicht trocken', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10', h => ({ precipitation: h < 10 ? 0.01 : 0 })));
      expect(result.observed.precipitationSum).toBeCloseTo(0.1, 10);
      expect(result.observed.isDryDay).toBe(false);
    });

    it('0,0 mm → trocken; Niederschlag null → unvollständig und isDryDay = null (nicht trocken)', () => {
      expect(day('2026-11-10', berlinDay('2026-11-10')).observed.isDryDay).toBe(true);
      const withNull = day('2026-11-10', berlinDay('2026-11-10', h => ({ precipitation: h === 7 ? null : 0 })));
      expect(withNull.complete).toBe(false);
      expect(withNull.observed.isDryDay).toBeNull();
    });

    it('fehlende Stunde → unvollständig, isDryDay = null', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10').slice(1));
      expect(result.complete).toBe(false);
      expect(result.observed.isDryDay).toBeNull();
    });
  });

  describe('R13: Vollständigkeit', () => {
    it('heute ist nie vollständig, auch wenn alle Stunden vergangen sind (23:30)', () => {
      const now = new Date('2026-11-19T22:30:00Z');
      const result = day('2026-11-19', berlinDay('2026-11-19'), now);
      expect(result.hoursObserved).toBe(24);
      expect(result.complete).toBe(false);
    });

    it.each([
      ['2026-02', 28],
      ['2028-02', 29],
      ['2026-11', 30],
      ['2026-12', 31],
    ])('daysInMonth(%s) = %d', (yearMonth, expected) => {
      expect(daysInMonth(yearMonth)).toBe(expected);
    });

    it('daysInYear: 2026 → 365, 2028 → 366', () => {
      expect(daysInYear(2026)).toBe(365);
      expect(daysInYear(2028)).toBe(366);
    });
  });

  describe('R14: null-Werte', () => {
    it('US01-5: temperature null → Minimum der vorhandenen Werte (nie 0), complete = false', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10', h => ({ temperature: h === 4 ? null : 5 + h })));
      expect(result.observed.temperature.min).toBe(5);
      expect(result.observed.temperature.mean).toBeCloseTo((23 * 5 + (276 - 4)) / 23, 10);
      expect(result.complete).toBe(false);
    });

    it('windDirection null → Tag bleibt vollständig', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10', h => ({ windDirection: h === 2 ? null : 220 })));
      expect(result.complete).toBe(true);
    });

    it('alle Temperaturen null → mean/min/max null', () => {
      const result = day('2026-11-10', berlinDay('2026-11-10', () => ({ temperature: null })));
      expect(result.observed.temperature).toEqual({ mean: null, min: null, max: null, minAt: null, maxAt: null });
    });
  });

  it('R11: Tages-Min/Max ungerundet, Gleichstand → früheste Stunde', () => {
    const temps = [3.04, 3.03, 3.04, -0.04, -0.04];
    const result = day('2026-11-10', berlinDay('2026-11-10', h => ({ temperature: temps[h] ?? 1 })));
    expect(result.observed.temperature).toMatchObject({
      max: 3.04,
      maxAt: '2026-11-10T00:00',
      min: -0.04,
      minAt: '2026-11-10T03:00',
    });
  });
});

describe('AggregationService: Zusammenfassung (R12, R13)', () => {
  it('Mittel der Tagesmittel: 23-Stunden-Tag 10 °C und 25-Stunden-Tag 20 °C → 15 °C (nicht stundengewichtet)', () => {
    const march = day('2026-03-29', utcHours('2026-03-28T23:00:00Z', 23, () => ({ temperature: 10 })));
    const october = day('2026-10-25', utcHours('2026-10-24T22:00:00Z', 25, () => ({ temperature: 20 })));
    const result = service.summarize([march, october], 2);
    expect(result.temperature.mean).toBe(15);
    expect(result).toMatchObject({ daysComplete: 2, complete: true });
  });

  it('1 vollständiger Tag → dessen Mittel, complete = false; unvollständige Tage zählen nicht', () => {
    const full = day('2026-11-09', berlinDay('2026-11-09', () => ({ temperature: 4, precipitation: 0.5 })));
    const partial = day('2026-11-10', berlinDay('2026-11-10', () => ({ temperature: 30, precipitation: 9 })).slice(2));
    const result = service.summarize([full, partial], 30);
    expect(result).toMatchObject({ daysWithData: 2, daysComplete: 1, complete: false, dryDays: 0 });
    expect(result.temperature).toMatchObject({ mean: 4, min: 4, max: 4, minAt: '2026-11-09T00:00' });
    expect(result.precipitationSum).toBeCloseTo(12, 10);
  });

  it('kein vollständiger Tag → mean, min, max und precipitationSum null', () => {
    const partial = day('2026-11-10', berlinDay('2026-11-10').slice(1));
    const result = service.summarize([partial], 30);
    expect(result.temperature.mean).toBeNull();
    expect(result.precipitationSum).toBeNull();
    expect(result.daysComplete).toBe(0);
  });

  it('dryDays zählt vollständige Trockentage, monthsWithData die Monate mit Daten', () => {
    const days = [
      day('2026-10-31', berlinDay('2026-10-31')),
      day('2026-11-01', berlinDay('2026-11-01', () => ({ precipitation: 1 }))),
      day('2026-11-02', berlinDay('2026-11-02')),
    ];
    expect(service.summarize(days, 3)).toMatchObject({ dryDays: 2, monthsWithData: 2, complete: true });
  });
});

describe('AggregationService: Rekorde (R10, R11)', () => {
  const dry = (date: string) => day(date, berlinDay(date));
  const wet = (date: string, mm = 1) => day(date, berlinDay(date, h => ({ precipitation: h === 0 ? mm : 0 })));

  it('US06-2 / F14: 30,04 (früher) gegenüber 30,03 (später) → 30,04 mit Datum und Stunde von A', () => {
    const a = day('2026-07-02', berlinDay('2026-07-02', h => ({ temperature: h === 15 ? 30.04 : 20 })));
    const b = day('2026-07-06', berlinDay('2026-07-06', h => ({ temperature: h === 16 ? 30.03 : 20 })));
    expect(service.records([a, b]).hottest).toMatchObject({ value: 30.04, date: '2026-07-02', timeLocal: '2026-07-02T15:00' });
  });

  it('Gleichstand → früheste Stunde (hottest und coldest)', () => {
    const a = day('2026-07-02', berlinDay('2026-07-02', h => ({ temperature: h === 15 ? 31 : h === 3 ? -2 : 20 })));
    const b = day('2026-07-03', berlinDay('2026-07-03', h => ({ temperature: h === 10 ? 31 : h === 1 ? -2 : 20 })));
    const result = service.records([a, b]);
    expect(result.hottest).toMatchObject({ date: '2026-07-02', timeLocal: '2026-07-02T15:00' });
    expect(result.coldest).toMatchObject({ value: -2, date: '2026-07-02', timeLocal: '2026-07-02T03:00' });
  });

  it('US06-4 / F13: Vorhersagestunde heute mit 35 °C ändert hottest nicht; vergangene Stunden von heute zählen', () => {
    const past = day('2026-11-18', berlinDay('2026-11-18', () => ({ temperature: 12 })));
    const today = day('2026-11-19', berlinDay('2026-11-19', h => ({ temperature: h === 16 ? 35 : h === 9 ? 13 : 5 })));
    const result = service.records([past, today]);
    expect(result.hottest).toMatchObject({ value: 13, date: '2026-11-19' });
  });

  it('veraltete Vorhersage zählt nicht; null wird ignoriert', () => {
    const d = day('2026-11-10', berlinDay('2026-11-10', h => (h === 5 ? { temperature: 40, source: 'prediction' } : h === 6 ? { temperature: null } : {})));
    expect(service.records([d]).hottest?.value).toBe(10);
  });

  it('US06-3 / F27: 3 Trockentage, 1 Tag fehlt, 4 Trockentage → 4 und nicht 7', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'].map(dry);
    expect(service.records(days).longestDryPeriod).toEqual({ days: 4, from: '2026-07-05', to: '2026-07-08' });
  });

  it('R10: unvollständiger Tag beendet die Serie; Gleichstand → früheste Periode; Periode aus 1 Tag', () => {
    const incomplete = day('2026-07-03', berlinDay('2026-07-03').slice(1));
    expect(service.records([dry('2026-07-01'), dry('2026-07-02'), incomplete, dry('2026-07-04'), dry('2026-07-05')]).longestDryPeriod)
      .toEqual({ days: 2, from: '2026-07-01', to: '2026-07-02' });
    expect(service.records([wet('2026-07-01'), dry('2026-07-02'), wet('2026-07-03')]).longestDryPeriod)
      .toEqual({ days: 1, from: '2026-07-02', to: '2026-07-02' });
  });

  it('R10: heute ist nie vollständig, die Periode endet spätestens gestern', () => {
    const result = service.records([dry('2026-11-17'), dry('2026-11-18'), day('2026-11-19', berlinDay('2026-11-19'))]);
    expect(result.longestDryPeriod).toEqual({ days: 2, from: '2026-11-17', to: '2026-11-18' });
    expect(result.daysCounted).toBe(2);
  });

  it('wettestDay: höchste Summe vollständiger Tage, Gleichstand → früheste; unvollständige zählen nicht', () => {
    const partial = day('2026-07-05', berlinDay('2026-07-05', () => ({ precipitation: 5 })).slice(1));
    const result = service.records([wet('2026-07-01', 12.3), wet('2026-07-02', 12.3), partial]);
    expect(result.wettestDay).toEqual({ value: 12.3, date: '2026-07-01' });
  });

  it('US06-5: keine Daten → alle Rekorde null, daysCounted = 0', () => {
    expect(service.records([])).toEqual({ hottest: null, coldest: null, wettestDay: null, longestDryPeriod: null, daysCounted: 0 });
  });
});
