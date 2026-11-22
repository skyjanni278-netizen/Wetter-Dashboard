import { hoursInDay, isIsoDate, localDate } from '../common/berlin-time';
import type { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import type { ForecastStore } from '../forecasts/forecast.store';
import { emptyCounts } from '../imports/import';
import type { ImportCounts, ImportError, ImportRecord, ImportStatus, ImportWarning } from '../imports/import';
import type { ImportStore } from '../imports/import.store';
import { HEUBACH } from '../locations/location';
import type { ObservationInput, ObservationSource } from '../observations/observation';
import { WMO_CODES } from '../observations/observation.entity';
import type { ObservationStore } from '../observations/observation.store';
import { LEGACY_FORECAST_FILE, readLegacyArchive } from './legacy-files';
import type { LegacyArchive, LegacyDayFile, LegacyFileError, LegacyMonth } from './legacy-files';
import { LEGACY_TIME_RULE, legacyTimeToUtc } from './legacy-time';
import type { LegacyTimeRule } from './legacy-time';

/**
 * Altdatenimport (US15, 03 B2.7 Schritte 4–9): liest die Tagesdateien und `forecast.json` von Express, rechnet
 * die Ortszeiten nach `LEGACY_TIME_RULE` in UTC um und schreibt über dieselben Stores wie der API-Import
 * (`ImportStore` mit `kind = "legacy"`, `ObservationStore.upsertHours`, `ForecastStore.save`).
 *
 * - **Herkunft (Z2):** Tage bis `LEGACY_ARCHIVE_UNTIL` stammen aus dem Archiv (Backfill vom 19.11.2026),
 *   spätere aus der Forecast-API. `fetched_at` ist die Änderungszeit der Datei; eine Stunde danach war beim
 *   Schreiben eine Vorhersage (R08, entscheidet der Store).
 * - **Transaktion je Monatsordner:** Ein Monat mit einer ungültigen Datei wird nicht geschrieben, die übrigen
 *   schon (US15-4). Status dann `partial`, ohne einen geschriebenen Monat `failed`.
 * - **Idempotent:** Ein zweiter Lauf zählt alle Stunden als `unchanged` (US15-3), weil Herkunft und R08 nur von
 *   der Datei abhängen, nicht vom Zeitpunkt des Laufs.
 * - **Nur lesend** im Quellordner. `dryRun` prüft alles und schreibt nichts, auch keinen Import-Eintrag.
 */

/** Letzter Tag aus der Archiv-API (03 Z2: Backfill am 19.11.2026 mit `RECENT_DAYS = 10`). */
export const LEGACY_ARCHIVE_UNTIL = '2026-11-08';

const WMO = new Set<number>(WMO_CODES);
const DATE_IN_FILE = /(\d{4}-\d{2}-\d{2})\.json$/;
const SOURCES: readonly ObservationSource[] = ['archive', 'forecast_api', 'prediction'];

export interface LegacyImportOptions {
  dir: string;
  dryRun: boolean;
}

export interface LegacyImportDependencies {
  imports: ImportStore;
  observations: ObservationStore;
  forecasts: ForecastStore;
  clock: Clock;
}

export interface SourceCount {
  /** Tage (Dateien) mit mindestens einer Stunde dieser Herkunft. */
  days: number;
  hours: number;
}

/** Geprüfter und umgerechneter Inhalt eines Monatsordners. */
interface PlannedMonth {
  month: string;
  hours: ObservationInput[];
  errors: LegacyFileError[];
}

export interface LegacyImportReport {
  dir: string;
  dryRun: boolean;
  rule: LegacyTimeRule;
  files: { total: number; valid: number; invalid: number };
  invalidFiles: LegacyFileError[];
  /** Monate, die wegen einer ungültigen Datei oder eines Schreibfehlers nicht geschrieben wurden. */
  skippedMonths: string[];
  writtenMonths: string[];
  /** Umgerechnete Stunden aller gültigen Dateien. */
  hours: number;
  bySource: Record<ObservationSource, SourceCount>;
  forecastDays: number;
  warnings: ImportWarning[];
  /** `null` beim Probelauf. */
  counts: ImportCounts | null;
  importId: number | null;
  status: ImportStatus | null;
  error: ImportError | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Herkunft einer Datei nach Z2 (ohne R08, das entscheidet der Store über `fetchedAt`). */
export function legacySourceOf(date: string): 'archive' | 'forecast_api' {
  return date <= LEGACY_ARCHIVE_UNTIL ? 'archive' : 'forecast_api';
}

/** Stunden einer Datei als Eingabe für `upsertHours`; unbekannte Wettercodes → `null` plus Warnung. */
function toInputs(file: LegacyDayFile, warnings: ImportWarning[]): ObservationInput[] {
  const source = legacySourceOf(file.date);
  return file.day.hourly.map(hour => {
    const timeUtc = legacyTimeToUtc(hour.time);
    if (timeUtc === null) throw new Error(`${file.file}: ${hour.time} gibt es nach Regel ${LEGACY_TIME_RULE} nicht`);
    let weatherCode = hour.weathercode;
    if (weatherCode !== null && !WMO.has(weatherCode)) {
      warnings.push({
        code: 'LEGACY_UNKNOWN_WEATHER_CODE',
        message: `${file.file} ${hour.time}: Wettercode ${weatherCode} unbekannt, als null übernommen`,
        timeUtc,
      });
      weatherCode = null;
    }
    return {
      timeUtc,
      temperature: hour.temperature,
      apparentTemperature: hour.apparentTemperature,
      precipitation: hour.precipitation,
      weatherCode,
      windSpeed: hour.windspeed,
      windDirection: hour.winddirection,
      source,
      fetchedAt: file.modifiedAt,
    };
  });
}

function planMonth(month: LegacyMonth, warnings: ImportWarning[]): PlannedMonth {
  const errors = [...month.errors];
  const hours: ObservationInput[] = [];
  for (const file of month.files) {
    try {
      hours.push(...toInputs(file, warnings));
    } catch (error) {
      errors.push({ file: file.file, message: errorText(error) });
    }
  }
  return { month: month.month, hours, errors };
}

/** Wie der Store die Herkunft speichern wird (R08: Stunde nach dem Abrufzeitpunkt = Vorhersage). */
function storedSource(hour: ObservationInput): ObservationSource {
  return Date.parse(hour.timeUtc) > Date.parse(hour.fetchedAt!) ? 'prediction' : hour.source!;
}

function countSources(hours: readonly ObservationInput[]): Record<ObservationSource, SourceCount> {
  const days = new Map<ObservationSource, Set<string>>(SOURCES.map(s => [s, new Set()]));
  const result = Object.fromEntries(SOURCES.map(s => [s, { days: 0, hours: 0 }])) as Record<ObservationSource, SourceCount>;
  for (const hour of hours) {
    const source = storedSource(hour);
    result[source].hours++;
    days.get(source)!.add(localDate(new Date(hour.timeUtc)));
  }
  for (const source of SOURCES) result[source].days = days.get(source)!.size;
  return result;
}

/** B2.7 Schritt 5: Stunden je Berliner Tag gegen `hoursInDay` (23/24/25); Abweichungen als Warnung. */
function hourCountWarnings(hours: readonly ObservationInput[]): ImportWarning[] {
  const perDay = new Map<string, number>();
  for (const hour of hours) {
    const date = localDate(new Date(hour.timeUtc));
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  return [...perDay]
    .filter(([date, count]) => count !== hoursInDay(date))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      code: 'LEGACY_HOURS_PER_DAY',
      message: `${date}: ${count} Stunden nach der Umrechnung, erwartet ${hoursInDay(date)}`,
    }));
}

function formatSources(bySource: Record<ObservationSource, SourceCount>): string {
  return SOURCES.map(s => `${s} ${bySource[s].days} Tage / ${bySource[s].hours} Stunden`).join(', ');
}

/** Gelesener und geprüfter Altbestand mit dem Bericht des Probelaufs. */
interface PreparedImport {
  archive: LegacyArchive;
  validMonths: PlannedMonth[];
  range: { from: string; to: string };
  report: LegacyImportReport;
}

/** Liest, prüft und rechnet um (B2.7 Schritte 4–7), ohne etwas zu schreiben. */
async function prepareLegacyImport(options: LegacyImportOptions): Promise<PreparedImport> {
  const archive = await readLegacyArchive(options.dir);
  const dates = archive.months
    .flatMap(m => [...m.files.map(f => f.date), ...m.errors.map(e => DATE_IN_FILE.exec(e.file)?.[1])])
    .filter((date): date is string => date !== undefined && isIsoDate(date))
    .sort();
  if (dates.length === 0) throw new Error(`Keine Tagesdateien (YYYY-MM/YYYY-MM-DD.json) in ${options.dir}`);

  const warnings: ImportWarning[] = [];
  const planned = archive.months.map(month => planMonth(month, warnings));
  const validMonths = planned.filter(m => m.errors.length === 0);
  const invalidFiles = planned.flatMap(m => m.errors);
  const validHours = validMonths.flatMap(m => m.hours);
  const bySource = countSources(validHours);
  const fileCount = archive.months.reduce((n, m) => n + m.files.length + m.errors.length, 0);

  warnings.unshift(
    {
      code: 'LEGACY_TIME_RULE',
      message: `Ortszeiten der Altdateien nach Regel ${LEGACY_TIME_RULE} in UTC umgerechnet (DST-Stichprobe, 03 B2.7 Schritt 2, PROJEKTDOKU 3a.13)`,
    },
    {
      code: 'LEGACY_SOURCES',
      message: `Herkunft (Z2, R08): ${formatSources(bySource)}; archive bis ${LEGACY_ARCHIVE_UNTIL}, fetched_at = Änderungszeit der Datei`,
    },
  );
  for (const error of invalidFiles) {
    warnings.push({ code: 'LEGACY_INVALID_FILE', message: `${error.file}: ${error.message}` });
  }
  for (const month of planned.filter(m => m.errors.length > 0)) {
    warnings.push({
      code: 'LEGACY_MONTH_SKIPPED',
      message: `Monat ${month.month} nicht geschrieben: ${month.errors.length} ungültige Datei(en)`,
    });
  }
  warnings.push(...hourCountWarnings(validHours));
  if (archive.forecastError) {
    warnings.push({ code: 'LEGACY_INVALID_FORECAST', message: `${LEGACY_FORECAST_FILE} ungültig: ${archive.forecastError}` });
  } else if (!archive.forecast) {
    warnings.push({ code: 'LEGACY_NO_FORECAST', message: `${LEGACY_FORECAST_FILE} fehlt, keine Vorhersage übernommen` });
  }

  const report: LegacyImportReport = {
    dir: options.dir,
    dryRun: options.dryRun,
    rule: LEGACY_TIME_RULE,
    files: { total: fileCount, valid: fileCount - invalidFiles.length, invalid: invalidFiles.length },
    invalidFiles,
    skippedMonths: planned.filter(m => m.errors.length > 0).map(m => m.month),
    writtenMonths: [],
    hours: validHours.length,
    bySource,
    forecastDays: archive.forecast?.days.length ?? 0,
    warnings,
    counts: null,
    importId: null,
    status: null,
    error: null,
  };
  return { archive, validMonths, range: { from: dates[0], to: dates[dates.length - 1] }, report };
}

/** Probelauf (`--dry-run`, US15-1): prüft alles und schreibt nichts, braucht keine Datenbank. */
export async function checkLegacyArchive(dir: string): Promise<LegacyImportReport> {
  return (await prepareLegacyImport({ dir, dryRun: true })).report;
}

export class LegacyImporter {
  constructor(private readonly deps: LegacyImportDependencies) {}

  /** Echter Lauf (US15-2/-3); mit `dryRun` derselbe Bericht wie `checkLegacyArchive`. */
  async run(options: LegacyImportOptions): Promise<LegacyImportReport> {
    const prepared = await prepareLegacyImport(options);
    if (options.dryRun) return prepared.report;
    return this.write(prepared.archive, prepared.validMonths, prepared.report, prepared.range);
  }

  /** Schreibt Monat für Monat (je eine Transaktion in `upsertHours`), dann die Vorhersage, dann den Status. */
  private async write(
    archive: LegacyArchive,
    months: readonly PlannedMonth[],
    report: LegacyImportReport,
    range: { from: string; to: string },
  ): Promise<LegacyImportReport> {
    const { imports, observations, forecasts, clock } = this.deps;
    const now = () => formatUtc(clock.now());
    const record: ImportRecord = await imports.create({
      locationId: HEUBACH.id,
      kind: 'legacy',
      from: range.from,
      to: range.to,
      overwriteCorrections: false,
      requestedBy: null,
      requestedAt: now(),
      counts: emptyCounts(),
      warnings: [],
    });
    report.importId = record.id;
    await imports.update(record.id, { status: 'running', startedAt: now() });

    try {
      const counts = emptyCounts();
      for (const month of months) {
        try {
          const written = await observations.upsertHours(month.hours, { mode: 'upsert', importId: record.id });
          counts.inserted += written.inserted;
          counts.updated += written.updated;
          counts.unchanged += written.unchanged;
          counts.skippedCorrected += written.skippedCorrected;
          report.writtenMonths.push(month.month);
        } catch (error) {
          // Die Transaktion des Monats ist zurückgerollt; die übrigen Monate laufen weiter (US15-4).
          report.skippedMonths.push(month.month);
          report.warnings.push({ code: 'LEGACY_MONTH_FAILED', message: `Monat ${month.month} nicht geschrieben: ${errorText(error)}` });
        }
      }
      report.skippedMonths.sort();
      report.counts = counts;

      let forecastFailed = archive.forecastError !== null;
      if (archive.forecast && archive.forecast.days.length > 0) {
        try {
          await forecasts.save({
            days: archive.forecast.days.map(day => ({
              date: day.date,
              maxTemp: day.maxTemp,
              minTemp: day.minTemp,
              precipitationSum: day.precipitation,
              weatherCode: day.weathercode !== null && WMO.has(day.weathercode) ? day.weathercode : null,
            })),
            fetchedAt: archive.forecast.modifiedAt,
            importId: record.id,
          });
        } catch (error) {
          forecastFailed = true;
          report.warnings.push({ code: 'LEGACY_FORECAST_FAILED', message: `${LEGACY_FORECAST_FILE} nicht gespeichert: ${errorText(error)}` });
        }
      }

      if (report.writtenMonths.length === 0) {
        report.status = 'failed';
        report.error = { code: 'LEGACY_INVALID', message: 'Kein Monat geschrieben (alle Monate ungültig oder fehlgeschlagen)' };
      } else {
        report.status = report.skippedMonths.length > 0 || forecastFailed ? 'partial' : 'succeeded';
      }
      await imports.update(record.id, {
        status: report.status,
        finishedAt: now(),
        counts,
        warnings: report.warnings,
        error: report.error,
      });
      return report;
    } catch (error) {
      // Unerwarteter Fehler (z. B. beim Speichern des Status): Import nicht hängen lassen (R19).
      await imports
        .update(record.id, {
          status: 'failed',
          finishedAt: now(),
          warnings: report.warnings,
          error: { code: 'INTERNAL_ERROR', message: 'Unerwarteter Fehler beim Altdatenimport' },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
