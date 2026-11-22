import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hoursInDay, startOfDayUtc } from '../../src/common/berlin-time';
import { formatUtc } from '../../src/common/utc';
import { applySeed } from '../../src/database/seeds/apply-seed';
import type { SeedSummary } from '../../src/database/seeds/apply-seed';
import type { Fixture, FixtureObservation } from '../../src/fixtures/fixture';
import { hourValues } from './fakes';

/**
 * Fixtures in der Datenbank der Test-App (`:memory:`), über denselben Weg wie `npm run db:seed -- --fixture`
 * (`applySeed`). Ersetzt seit Schritt 9b den Testpfad mit In-Memory-Stores.
 */
export function seedApp(app: INestApplicationContext, fixture: Fixture, now: Date | string): Promise<SeedSummary> {
  return applySeed(app.get(DataSource), fixture, typeof now === 'string' ? new Date(now) : now);
}

/** Fixture ohne Importe und Vorhersage (`applySeed` legt dann einen Import `range` an). */
export function fixtureOf(observations: FixtureObservation[] = [], extra: Partial<Fixture> = {}): Fixture {
  return { name: 'test', description: '', fakeNow: null, observations, imports: [], forecast: null, ...extra };
}

/** Alle 23/24/25 UTC-Stunden eines Berliner Tages, Werte wie `hourValues`; Herkunft `archive`. */
export function dayObservations(
  date: string,
  valueOf: (hour: number) => Partial<ReturnType<typeof hourValues>> = () => ({}),
  source: FixtureObservation['source'] = 'archive',
): FixtureObservation[] {
  const start = startOfDayUtc(date).getTime();
  return Array.from({ length: hoursInDay(date) }, (_, i) => ({
    timeUtc: formatUtc(new Date(start + i * 3_600_000)),
    ...hourValues(i, valueOf(i)),
    source,
  }));
}
