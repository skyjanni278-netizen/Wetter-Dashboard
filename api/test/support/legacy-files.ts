import { cp, mkdir, mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import type { Clock } from '../../src/common/clock';
import { FORECAST_STORE } from '../../src/forecasts/forecast.store';
import { IMPORT_STORE } from '../../src/imports/import.store';
import type { LegacyForecastDay, LegacyHour } from '../../src/legacy/legacy-day.schema';
import { LEGACY_FORECAST_FILE } from '../../src/legacy/legacy-files';
import { LegacyImporter } from '../../src/legacy/legacy-import';
import type { LegacyImportReport } from '../../src/legacy/legacy-import';
import { OBSERVATION_STORE } from '../../src/observations/observation.store';
import { hourValues } from './fakes';

/**
 * Altdateien im Format von Express für Tests (Temp-Ordner) und der Altdatenimport in die Datenbank einer
 * Test-App. Seit Schritt 9b kommt der Altbestand in Tests nur noch so in die App: über denselben
 * `LegacyImporter` wie `npm run cli -- import:legacy`.
 */

/** 24 Stunden eines Tages im Altformat (Ortszeit ohne Offset), Werte wie `hourValues`. */
export function legacyHours(date: string, valueOf: (hour: number) => Partial<ReturnType<typeof hourValues>> = () => ({})): LegacyHour[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const v = hourValues(hour, valueOf(hour));
    return {
      time: `${date}T${String(hour).padStart(2, '0')}:00`,
      temperature: v.temperature,
      apparentTemperature: v.apparentTemperature,
      precipitation: v.precipitation,
      weathercode: v.weatherCode,
      windspeed: v.windSpeed,
      winddirection: v.windDirection,
    };
  });
}

/**
 * Schreibt `<dir>/YYYY-MM/YYYY-MM-DD.json`; `modifiedAt` setzt die Änderungszeit (= Abrufzeitpunkt, R08),
 * sonst bleibt die echte Schreibzeit. Liefert den Pfad.
 */
export async function writeLegacyDay(
  dir: string,
  date: string,
  options: { hourly?: unknown[]; modifiedAt?: string; content?: unknown } = {},
): Promise<string> {
  const file = path.join(dir, date.slice(0, 7), `${date}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  const content = options.content ?? { date, location: 'Heubach', hourly: options.hourly ?? legacyHours(date) };
  await writeFile(file, JSON.stringify(content, null, 2));
  if (options.modifiedAt) await utimes(file, new Date(options.modifiedAt), new Date(options.modifiedAt));
  return file;
}

export async function writeLegacyForecast(dir: string, days: LegacyForecastDay[], modifiedAt?: string): Promise<string> {
  const file = path.join(dir, LEGACY_FORECAST_FILE);
  await writeFile(file, JSON.stringify(days, null, 2));
  if (modifiedAt) await utimes(file, new Date(modifiedAt), new Date(modifiedAt));
  return file;
}

/** 7 Vorhersagetage im Format von `forecast.json`, ab dem 2026-11-`firstDay`. */
export function legacyForecastDays(firstDay: number): LegacyForecastDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(firstDay + i).padStart(2, '0')}`,
    maxTemp: 8.6,
    minTemp: 7.1,
    precipitation: 9.23,
    weathercode: 80,
  }));
}

export function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/**
 * Kopie der Tagesdateien bis einschließlich `until` (Berliner Datum der festen Uhr des Tests) in einen
 * Temp-Ordner, **mit** den Änderungszeiten (`preserveTimestamps`), ohne `forecast.json`. So hängt ein Test mit
 * `backend/data` nicht davon ab, ob Express danach noch weitere Tage geschrieben hat. Die Quelle bleibt unberührt.
 */
export async function copyLegacySubset(sourceDir: string, until: string): Promise<string> {
  const target = await tempDir('wetter-legacy-subset-');
  for (const month of (await readdir(sourceDir)).filter(name => /^\d{4}-\d{2}$/.test(name))) {
    for (const name of await readdir(path.join(sourceDir, month))) {
      const date = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1];
      if (!date || date > until) continue;
      await mkdir(path.join(target, month), { recursive: true });
      await cp(path.join(sourceDir, month, name), path.join(target, month, name), { preserveTimestamps: true });
    }
  }
  return target;
}

/** Altdatenimport in die Datenbank der Test-App, mit deren Stores und der Uhr des Tests. */
export function importLegacy(app: INestApplicationContext, dir: string, clock: Clock): Promise<LegacyImportReport> {
  return new LegacyImporter({
    imports: app.get(IMPORT_STORE),
    observations: app.get(OBSERVATION_STORE),
    forecasts: app.get(FORECAST_STORE),
    clock,
  }).run({ dir, dryRun: false });
}
