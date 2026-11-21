import { addDays, hoursInDay, localHour, startOfDayUtc } from '../../common/berlin-time';
import { formatUtc } from '../../common/utc';
import { FixtureSchema } from '../../fixtures/fixture';
import type { Fixture, FixtureObservation } from '../../fixtures/fixture';

/** Erster Seed-Tag; der zweite ist das Ende der Sommerzeit 2026 (25 Stunden, 02:00 doppelt). */
export const DEV_SEED_FROM = '2026-10-24';
export const DEV_SEED_DST_DAY = '2026-10-25';
export const DEV_SEED_TO = '2026-10-26';

/** Lücke am 26.10.: 03:00–05:00 Uhr (MEZ) fehlen ganz (`gap.reason = "missing"`). */
export const DEV_SEED_MISSING_LOCAL_HOURS: readonly number[] = [3, 4, 5];
/** Am 26.10. um 12:00 Uhr ist die Temperatur `null` (R14, `gap.reason = "null_values"`). */
export const DEV_SEED_NULL_LOCAL_HOUR = 12;

const HOUR_MS = 60 * 60 * 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Stundenwerte eines Tagesgangs: kühl am Morgen, mild am Nachmittag, etwas Regen am Abend. */
function observation(instant: Date, index: number, hour: number): FixtureObservation {
  const rain = hour >= 18 && hour <= 20;
  return {
    timeUtc: formatUtc(instant),
    temperature: round1(9 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + index / 100),
    apparentTemperature: round1(6 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)),
    precipitation: rain ? 0.4 : 0,
    weatherCode: rain ? 61 : 3,
    windSpeed: 12.5,
    windDirection: 230,
    source: 'archive',
  };
}

function buildDevSeed(): Fixture {
  const observations: FixtureObservation[] = [];
  let index = 0;
  for (let date = DEV_SEED_FROM; date <= DEV_SEED_TO; date = addDays(date, 1)) {
    const start = startOfDayUtc(date).getTime();
    for (let i = 0; i < hoursInDay(date); i++) {
      const instant = new Date(start + i * HOUR_MS);
      const hour = localHour(instant);
      if (date === DEV_SEED_TO && DEV_SEED_MISSING_LOCAL_HOURS.includes(hour)) continue;
      const entry = observation(instant, index++, hour);
      if (date === DEV_SEED_TO && hour === DEV_SEED_NULL_LOCAL_HOUR) entry.temperature = null;
      observations.push(entry);
    }
  }
  return FixtureSchema.parse({
    name: 'dev',
    description:
      'Entwicklungsdaten (03 B4.4): 24.10.2026 vollständig, 25.10.2026 mit 25 Stunden (Ende der Sommerzeit), ' +
      '26.10.2026 mit Lücke 03:00–05:00 Uhr und Temperatur null um 12:00 Uhr. Ein Import kind = "range".',
    fakeNow: null,
    observations,
    imports: [
      {
        kind: 'range',
        status: 'succeeded',
        from: DEV_SEED_FROM,
        to: DEV_SEED_TO,
        requestedAt: '2026-10-27T06:00:00Z',
        startedAt: '2026-10-27T06:00:00Z',
        finishedAt: '2026-10-27T06:00:05Z',
      },
    ],
    forecast: null,
  });
}

/**
 * Dev-Seed (`npm run db:seed` ohne `--fixture`, 03 B4.4): kleine Testfälle für die Entwicklung, im Format der
 * Fixtures. Nur für die Dev-DB; Seeds verweigern sich bei gesammelten Daten (`collected-data.ts`).
 */
export const DEV_SEED: Fixture = buildDevSeed();
