import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isIsoDate } from '../common/berlin-time';
import { formatUtc } from '../common/utc';
import { describeLegacyIssues, LegacyDaySchema, LegacyForecastSchema } from './legacy-day.schema';
import type { LegacyDay, LegacyForecastDay } from './legacy-day.schema';

/**
 * Liest den Altbestand von Express (`backend/data` bzw. dessen Sicherung) **nur lesend**: Tagesdateien
 * `YYYY-MM/YYYY-MM-DD.json` und `forecast.json`, jeweils mit der Änderungszeit der Datei (= Abrufzeitpunkt,
 * 03 Z2, B2.7 Schritt 6). Jede Tagesdatei wird mit `LegacyDaySchema` geprüft (B2.7 Schritt 4).
 */
export const LEGACY_FORECAST_FILE = 'forecast.json';
const MONTH_DIR = /^\d{4}-\d{2}$/;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** Eine gültige Tagesdatei. `file` relativ zum Ordner (`2025-07/2025-07-15.json`). */
export interface LegacyDayFile {
  date: string;
  file: string;
  /** Änderungszeit der Datei (UTC, `YYYY-MM-DDTHH:MM:SSZ`). */
  modifiedAt: string;
  day: LegacyDay;
}

export interface LegacyFileError {
  file: string;
  message: string;
}

/** Inhalt eines Monatsordners; eine Datei in `errors` verhindert das Schreiben des ganzen Monats (US15-4). */
export interface LegacyMonth {
  month: string;
  files: LegacyDayFile[];
  errors: LegacyFileError[];
}

export interface LegacyForecastFile {
  modifiedAt: string;
  days: LegacyForecastDay[];
}

export interface LegacyArchive {
  dir: string;
  months: LegacyMonth[];
  /** `null`, wenn `forecast.json` fehlt oder ungültig ist (dann steht der Grund in `forecastError`). */
  forecast: LegacyForecastFile | null;
  forecastError: string | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(file: string): Promise<{ content: unknown; modifiedAt: string }> {
  const [text, info] = await Promise.all([readFile(file, 'utf-8'), stat(file)]);
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch (error) {
    throw new Error(`kein gültiges JSON (${errorText(error)})`);
  }
  return { content, modifiedAt: formatUtc(info.mtime) };
}

/** Liest und prüft eine Tagesdatei; Dateiname = `date` (B2.7 Schritt 4). */
export async function readLegacyDayFile(dir: string, date: string): Promise<LegacyDayFile> {
  const file = `${date.slice(0, 7)}/${date}.json`;
  const { content, modifiedAt } = await readJson(path.join(dir, date.slice(0, 7), `${date}.json`));
  const parsed = LegacyDaySchema.safeParse(content);
  if (!parsed.success) throw new Error(describeLegacyIssues(parsed.error));
  if (parsed.data.date !== date) throw new Error(`date "${parsed.data.date}" passt nicht zum Dateinamen`);
  return { date, file, modifiedAt, day: parsed.data };
}

async function readMonth(dir: string, month: string): Promise<LegacyMonth> {
  const result: LegacyMonth = { month, files: [], errors: [] };
  const names = (await readdir(path.join(dir, month))).filter(name => name.endsWith('.json')).sort();
  for (const name of names) {
    const date = DAY_FILE.exec(name)?.[1];
    if (!date || !isIsoDate(date) || !date.startsWith(`${month}-`)) {
      result.errors.push({ file: `${month}/${name}`, message: 'Dateiname ist kein Tag dieses Monats (YYYY-MM-DD.json)' });
      continue;
    }
    try {
      result.files.push(await readLegacyDayFile(dir, date));
    } catch (error) {
      result.errors.push({ file: `${month}/${name}`, message: errorText(error) });
    }
  }
  return result;
}

async function readForecast(dir: string): Promise<Pick<LegacyArchive, 'forecast' | 'forecastError'>> {
  const file = path.join(dir, LEGACY_FORECAST_FILE);
  try {
    const { content, modifiedAt } = await readJson(file);
    const parsed = LegacyForecastSchema.safeParse(content);
    if (!parsed.success) return { forecast: null, forecastError: describeLegacyIssues(parsed.error) };
    return { forecast: { modifiedAt, days: parsed.data }, forecastError: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { forecast: null, forecastError: null };
    return { forecast: null, forecastError: errorText(error) };
  }
}

/** Liest alle Monatsordner (aufsteigend) und `forecast.json`. Wirft nur, wenn `dir` selbst nicht lesbar ist. */
export async function readLegacyArchive(dir: string): Promise<LegacyArchive> {
  const entries = await readdir(dir, { withFileTypes: true });
  const monthNames = entries.filter(e => e.isDirectory() && MONTH_DIR.test(e.name)).map(e => e.name).sort();
  const months: LegacyMonth[] = [];
  for (const month of monthNames) months.push(await readMonth(dir, month));
  return { dir, months, ...(await readForecast(dir)) };
}
