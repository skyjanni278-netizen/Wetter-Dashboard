import { describeLegacyIssues, LegacyDaySchema, LegacyForecastSchema } from './legacy-day.schema';

function hour(time: string, override: Record<string, unknown> = {}) {
  return {
    time,
    temperature: 16.5,
    apparentTemperature: 17,
    precipitation: 0,
    weathercode: 2,
    windspeed: 5.9,
    winddirection: 191,
    ...override,
  };
}

function day(
  date = '2025-07-15',
  hours: { time: string; [key: string]: unknown }[] = Array.from({ length: 24 }, (_, h) => hour(`${date}T${String(h).padStart(2, '0')}:00`)),
) {
  return { date, location: 'Heubach', hourly: hours };
}

function issues(value: unknown): string {
  const result = LegacyDaySchema.safeParse(value);
  return result.success ? '' : describeLegacyIssues(result.error, 10);
}

describe('LegacyDaySchema (03 B2.7 Schritt 4, Z4)', () => {
  it('gültige Datei im Format von Express', () => {
    expect(LegacyDaySchema.safeParse(day()).success).toBe(true);
  });

  it('Zahlen dürfen null sein (R14)', () => {
    const hours = day().hourly.map((h, i) => (i === 3 ? hour(h.time, { temperature: null, weathercode: null }) : h));
    expect(LegacyDaySchema.safeParse(day('2025-07-15', hours)).success).toBe(true);
  });

  it('F16: Seed-Format ohne apparentTemperature, windspeed, winddirection → ungültig', () => {
    const seed = day().hourly.map(h => ({ time: h.time, temperature: h.temperature, precipitation: 0, weathercode: 3 }));
    expect(issues(day('2025-07-15', seed))).toMatch(/hourly\.0\.apparentTemperature/);
  });

  it('.strict(): unbekanntes Feld → ungültig', () => {
    expect(issues({ ...day(), extra: 1 })).toMatch(/extra/);
    const hours = day().hourly.map((h, i) => (i === 0 ? { ...h, humidity: 80 } : h));
    expect(issues(day('2025-07-15', hours))).toMatch(/humidity/);
  });

  it('23 oder 25 Einträge → ungültig (Express schreibt immer 24)', () => {
    expect(issues(day('2025-07-15', day().hourly.slice(0, 23)))).toMatch(/hourly/);
  });

  it('time eines anderen Tages und doppelte Zeit → ungültig', () => {
    const other = day().hourly.map((h, i) => (i === 5 ? hour('2025-07-16T05:00') : h));
    expect(issues(day('2025-07-15', other))).toMatch(/gehört nicht zum 2025-07-15/);
    const twice = day().hourly.map((h, i) => (i === 5 ? hour('2025-07-15T04:00') : h));
    expect(issues(day('2025-07-15', twice))).toMatch(/2025-07-15T04:00 doppelt/);
  });

  it.each([
    ['temperature', 51],
    ['temperature', -50.1],
    ['apparentTemperature', 61],
    ['precipitation', -0.1],
    ['windspeed', 301],
    ['winddirection', 361],
    ['temperature', '9,6'],
  ])('R16: %s = %j → ungültig', (field, value) => {
    const hours = day().hourly.map((h, i) => (i === 7 ? hour(h.time, { [field]: value }) : h));
    expect(issues(day('2025-07-15', hours))).toMatch(new RegExp(`hourly\\.7\\.${field}`));
  });

  it('location muss Heubach sein, date ein Kalendertag', () => {
    expect(issues({ ...day(), location: 'Aalen' })).toMatch(/location/);
    expect(issues({ ...day('2025-02-30'), hourly: day().hourly })).toMatch(/date/);
  });
});

describe('LegacyForecastSchema', () => {
  it('Liste der Tage; minTemp > maxTemp → ungültig', () => {
    const entry = { date: '2026-11-21', maxTemp: 6.7, minTemp: 0.8, precipitation: 5.6, weathercode: 80 };
    expect(LegacyForecastSchema.safeParse([entry]).success).toBe(true);
    expect(LegacyForecastSchema.safeParse([{ ...entry, minTemp: 7 }]).success).toBe(false);
    expect(LegacyForecastSchema.safeParse({ days: [entry] }).success).toBe(false);
  });
});
