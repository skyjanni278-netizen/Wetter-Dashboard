import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isIsoDate, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { LEGACY_DATA_DIR } from './legacy-data-dir';
import {
  LegacyDayFile,
  LegacyDayFileRaw,
  LegacyForecast,
  LegacyForecastRaw,
  LegacyHour,
  LegacyHourRaw,
} from './legacy-types';

const MONTH_DIR = /^\d{4}-\d{2}$/;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const FORECAST_FILE = 'forecast.json';

/** Zahl oder `null`; `NaN`, Text und fehlende Werte werden `null` (keine 0 als Ersatz, F15). */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toHour(raw: LegacyHourRaw): LegacyHour {
  return {
    time: raw.time,
    temperature: numberOrNull(raw.temperature),
    apparentTemperature: numberOrNull(raw.apparentTemperature),
    precipitation: numberOrNull(raw.precipitation),
    weatherCode: numberOrNull(raw.weathercode),
    windSpeed: numberOrNull(raw.windspeed),
    windDirection: numberOrNull(raw.winddirection),
  };
}

function isDayFile(value: unknown): value is LegacyDayFileRaw {
  if (typeof value !== 'object' || value === null) return false;
  const hourly = (value as { hourly?: unknown }).hourly;
  return Array.isArray(hourly) && hourly.every(h => typeof (h as { time?: unknown })?.time === 'string');
}

/**
 * Liest die JSON-Dateien von Express aus `backend/data/` (Übergang bis Schritt 9).
 *
 * - Beim Start werden alle Tagesdateien asynchron in eine `Map<date, hours[]>` geladen.
 * - Die Datei für den heutigen Berliner Tag und `forecast.json` werden bei jeder Anfrage
 *   neu gelesen, weil Express sie stündlich überschreibt.
 * - Nur lesend: Diese Klasse schreibt, verschiebt und löscht nichts im Datenordner.
 */
@Injectable()
export class LegacyFileSource implements OnModuleInit {
  private readonly logger = new Logger(LegacyFileSource.name);
  private readonly days = new Map<string, LegacyHour[]>();

  constructor(
    @Inject(LEGACY_DATA_DIR) private readonly dataDir: string,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadAll();
  }

  /** Berliner Datum von heute (über die Clock). */
  today(): string {
    return localDate(this.clock.now());
  }

  /** Stunden eines Tages oder `null`, wenn es keine Daten gibt. */
  async getDay(date: string): Promise<LegacyHour[] | null> {
    return (await this.getDayFile(date))?.hours ?? null;
  }

  /**
   * Stunden eines Tages mit der Änderungszeit der Datei. `modifiedAt` gibt es nur für die heutige
   * Datei, weil nur sie bei jeder Anfrage neu gelesen wird; sonst `null`.
   */
  async getDayFile(date: string): Promise<LegacyDayFile | null> {
    if (!isIsoDate(date)) return null;
    if (date === this.today()) {
      const fresh = await this.readDayFile(date, true);
      if (fresh) {
        this.days.set(date, fresh.hours);
        return fresh;
      }
    }
    const hours = this.days.get(date);
    return hours ? { hours, modifiedAt: null } : null;
  }

  /** Erster und letzter Tag mit Daten (heutige Datei eingeschlossen) oder `null`. */
  async getDataRange(): Promise<{ from: string | null; to: string | null }> {
    await this.getDay(this.today());
    let from: string | null = null;
    let to: string | null = null;
    for (const date of this.days.keys()) {
      if (from === null || date < from) from = date;
      if (to === null || date > to) to = date;
    }
    return { from, to };
  }

  /** Inhalt von `forecast.json` oder `null`, wenn die Datei fehlt oder ungültig ist. */
  async getForecast(): Promise<LegacyForecast | null> {
    const file = path.join(this.dataDir, FORECAST_FILE);
    try {
      const [content, info] = await Promise.all([readFile(file, 'utf-8'), stat(file)]);
      const parsed: unknown = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        this.logger.warn(`${FORECAST_FILE} ist keine Liste, wird ignoriert`);
        return null;
      }
      const days = (parsed as LegacyForecastRaw[])
        .filter(entry => typeof entry?.date === 'string')
        .map(entry => ({
          date: entry.date,
          maxTemp: numberOrNull(entry.maxTemp),
          minTemp: numberOrNull(entry.minTemp),
          precipitationSum: numberOrNull(entry.precipitation),
          weatherCode: numberOrNull(entry.weathercode),
        }));
      return { days, fetchedAt: formatUtc(info.mtime) };
    } catch (error) {
      if (!isNotFound(error)) {
        this.logger.warn(`${FORECAST_FILE} nicht lesbar: ${errorText(error)}`);
      }
      return null;
    }
  }

  private async loadAll(): Promise<void> {
    const started = Date.now();
    let months: string[];
    try {
      const entries = await readdir(this.dataDir, { withFileTypes: true });
      months = entries.filter(e => e.isDirectory() && MONTH_DIR.test(e.name)).map(e => e.name).sort();
    } catch (error) {
      this.logger.warn(`Datenordner ${this.dataDir} nicht lesbar: ${errorText(error)}`);
      return;
    }

    for (const month of months) {
      let names: string[];
      try {
        names = await readdir(path.join(this.dataDir, month));
      } catch (error) {
        this.logger.warn(`Monatsordner ${month} nicht lesbar: ${errorText(error)}`);
        continue;
      }
      const files = names
        .map(name => DAY_FILE.exec(name)?.[1])
        .filter((date): date is string => date !== undefined && isIsoDate(date) && date.startsWith(month));
      const loaded = await Promise.all(files.map(async date => [date, await this.readDayFile(date)] as const));
      for (const [date, file] of loaded) {
        if (file) this.days.set(date, file.hours);
      }
    }

    this.logger.log(`${this.days.size} Tagesdateien aus ${this.dataDir} geladen (${Date.now() - started} ms)`);
  }

  private async readDayFile(date: string, withModifiedAt = false): Promise<LegacyDayFile | null> {
    const file = path.join(this.dataDir, date.slice(0, 7), `${date}.json`);
    try {
      const [content, info] = await Promise.all([
        readFile(file, 'utf-8'),
        withModifiedAt ? stat(file) : Promise.resolve(null),
      ]);
      const parsed: unknown = JSON.parse(content);
      if (!isDayFile(parsed)) {
        this.logger.warn(`${file} hat kein gültiges Format, wird ignoriert`);
        return null;
      }
      return { hours: parsed.hourly.map(toHour), modifiedAt: info ? formatUtc(info.mtime) : null };
    } catch (error) {
      if (!isNotFound(error)) {
        this.logger.warn(`${file} nicht lesbar: ${errorText(error)}`);
      }
      return null;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
