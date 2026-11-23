import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { IsoDateSchema } from '../common/dto/iso-date.schema';
import { MEASUREMENT_FIELDS, REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../observations/dto/observation-patch.schema';

/**
 * Feste Testdaten für Prüfungen mit fester Uhr (03 B4.8, US01-6, US16-4/-5, US20-6, US06-2…-4).
 * Seit Schritt 9 kommen sie mit `npm run db:seed -- --fixture <name>` in die Dev-DB (`database/seeds/`);
 * die App liest nur noch die Datenbank. Die e2e-Tests laden sie mit `loadFixture` und schreiben sie mit
 * `applySeed` in ihre `:memory:`-Datenbank (`test/support/seed.ts`, seit Schritt 9b).
 */

/** Ordner der Fixtures; gleich aus `src/fixtures` (Jest) und `dist/fixtures` (Build). */
export const FIXTURE_DIR = path.resolve(__dirname, '../../test/fixtures');

const FIXTURE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Volle UTC-Stunde `YYYY-MM-DDTHH:00:00Z`. */
const UtcHourSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/, { error: 'volle UTC-Stunde erwartet' });
const UtcInstantSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, { error: 'UTC-Zeitpunkt erwartet' });
const value = z.number().nullable();

const FixtureObservationSchema = z
  .object({
    timeUtc: UtcHourSchema,
    temperature: value,
    apparentTemperature: value,
    precipitation: value,
    weatherCode: value,
    windSpeed: value,
    windDirection: value,
    source: z.enum(['archive', 'forecast_api', 'prediction']),
  })
  .strict();

const FixtureImportSchema = z
  .object({
    kind: z.enum(['legacy', 'range', 'gaps', 'scheduled']),
    status: z.enum(['succeeded', 'partial', 'failed']),
    from: IsoDateSchema,
    to: IsoDateSchema,
    requestedAt: UtcInstantSchema,
    startedAt: UtcInstantSchema,
    finishedAt: UtcInstantSchema,
  })
  .strict();

const FixtureForecastSchema = z
  .object({
    fetchedAt: UtcInstantSchema,
    days: z.array(
      z
        .object({
          date: IsoDateSchema,
          maxTemp: value,
          minTemp: value,
          precipitationSum: value,
          weatherCode: value,
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Schritt 12a: eine schon durchgeführte Korrektur (N03, US06-7, US13-12). Der Wert in `observations[]` ist der
 * korrigierte (`newValue`); `applySeed` legt den Eintrag in `correction` an (Konto = erster Admin der DB) und
 * setzt `corrected_at` der Stunde.
 */
const FixtureCorrectionSchema = z
  .object({
    timeUtc: UtcHourSchema,
    field: z.enum(MEASUREMENT_FIELDS),
    oldValue: value,
    newValue: value,
    reason: z.string().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH),
    correctedAt: UtcInstantSchema,
  })
  .strict();

export const FixtureSchema = z
  .object({
    name: z.string().regex(FIXTURE_NAME),
    description: z.string(),
    /** Empfohlener Wert für `FAKE_NOW` (nur Hinweis, setzt die Uhr nicht). */
    fakeNow: UtcInstantSchema.nullable(),
    observations: z.array(FixtureObservationSchema),
    imports: z.array(FixtureImportSchema),
    forecast: FixtureForecastSchema.nullable(),
    /** Optional (seit Schritt 12a); fehlt = keine Korrekturen. */
    corrections: z.array(FixtureCorrectionSchema).optional(),
  })
  .strict();

export type Fixture = z.infer<typeof FixtureSchema>;
export type FixtureObservation = Fixture['observations'][number];
export type FixtureCorrection = NonNullable<Fixture['corrections']>[number];

/** Unbekannte oder ungültige Fixture; der Prozess startet dann nicht. */
export class FixtureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureConfigError';
  }
}

function availableFixtures(dir: string): string {
  try {
    const names = readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .map(name => name.slice(0, -'.json'.length))
      .sort();
    return names.length > 0 ? names.join(', ') : '(keine)';
  } catch {
    return '(Ordner fehlt)';
  }
}

/** Liest und prüft `<dir>/<name>.json`. Wirft `FixtureConfigError` mit verständlicher Meldung. */
export function loadFixture(name: string, dir: string = FIXTURE_DIR): Fixture {
  if (!FIXTURE_NAME.test(name)) {
    throw new FixtureConfigError(`FIXTURE="${name}" ist kein gültiger Name (nur a–z, 0–9 und -).`);
  }
  const file = path.join(dir, `${name}.json`);
  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    throw new FixtureConfigError(`Fixture "${name}" nicht gefunden (${file}). Vorhanden: ${availableFixtures(dir)}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new FixtureConfigError(`Fixture "${name}" ist kein gültiges JSON: ${(error as Error).message}`);
  }
  const result = FixtureSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new FixtureConfigError(`Fixture "${name}" ungültig an ${issue.path.join('.') || '(Wurzel)'}: ${issue.message}`);
  }
  if (result.data.name !== name) {
    throw new FixtureConfigError(`Fixture "${name}" trägt den Namen "${result.data.name}".`);
  }
  return result.data;
}

