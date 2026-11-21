import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { localDate, localDateTime, localHour, utcOffsetMinutes } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { HEUBACH } from '../locations/location';
import type {
  DataRange,
  ObservationHour,
  ObservationInput,
  ObservationSource,
  ObservationValues,
  StoredDay,
  UpsertCounts,
  UpsertMode,
} from './observation';
import { sameValues } from './observation';
import { Observation } from './observation.entity';
import type { ObservationStore, UpsertOptions } from './observation.store';

/** Zeilen je Upsert-Anweisung (03 B2.7 Schritt 8; 500 × 16 Parameter bleiben weit unter dem SQLite-Limit). */
export const UPSERT_CHUNK_SIZE = 500;

/** Messwertspalten in der Reihenfolge von `OBSERVATION_FIELDS`. */
const VALUE_COLUMNS = [
  'temperature',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed',
  'wind_direction',
] as const;

const INSERT_COLUMNS = [
  'location_id',
  'time_utc',
  'local_date',
  'local_hour',
  'utc_offset_min',
  ...VALUE_COLUMNS,
  'source',
  'import_id',
  'fetched_at',
  'version',
  'updated_at',
] as const;

/** Rohe Zeile aus SQL (snake_case wie die Tabelle). */
interface HourRow {
  local_date: string;
  time_utc: string;
  temperature: number | null;
  apparent_temperature: number | null;
  precipitation: number | null;
  weather_code: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  source: ObservationSource;
}

interface ExistingRow extends HourRow {
  corrected_at: string | null;
}

/** Eine zu schreibende Zeile mit den abgeleiteten Ortsfeldern (03 B2.5). */
interface WriteRow {
  timeUtc: string;
  localDate: string;
  localHour: number;
  utcOffsetMin: number;
  values: ObservationValues;
  source: ObservationSource;
}

const SELECT_HOUR = `"local_date", "time_utc", ${VALUE_COLUMNS.map(c => `"${c}"`).join(', ')}, "source"`;

/** „Werte unterscheiden sich“ (R20): null-sicherer Vergleich mit `IS NOT`. */
const VALUES_DIFFER = VALUE_COLUMNS.map(c => `"observation"."${c}" IS NOT excluded."${c}"`).join(' OR ');

/** R08: Eine Vorhersage, die jetzt als Messwert kommt (oder umgekehrt), ist eine Änderung, auch bei gleichen Werten. */
const PREDICTION_CHANGES = `("observation"."source" = 'prediction') <> (excluded."source" = 'prediction')`;

/** Eine vorhandene Stunde, die selbst eine Lücke ist (wie `GapsService`: `null` bei Temperatur oder Niederschlag). */
const HAS_NULL_VALUES = `("observation"."temperature" IS NULL OR "observation"."precipitation" IS NULL)`;

/**
 * Bedingung für `DO UPDATE … WHERE` je Art (R20: korrigierte Stunden nie):
 * - `upsert` (`range`, `scheduled`): Werte oder Vorhersage-Eigenschaft unterscheiden sich,
 * - `insertMissing` (`gaps`): nur Stunden, die selbst eine Lücke sind: veraltete Vorhersage, die jetzt als
 *   Messwert kommt (R08), oder `null` bei Temperatur/Niederschlag mit neuen Werten.
 */
const UPDATE_CONDITION: Record<UpsertMode, string> = {
  upsert: `"observation"."corrected_at" IS NULL AND (${VALUES_DIFFER} OR ${PREDICTION_CHANGES})`,
  insertMissing:
    `"observation"."corrected_at" IS NULL AND ((("observation"."source" = 'prediction') AND excluded."source" <> 'prediction')` +
    ` OR (${HAS_NULL_VALUES} AND (${VALUES_DIFFER})))`,
};

function upsertSql(rowCount: number, mode: UpsertMode): string {
  const row = `(${INSERT_COLUMNS.map(() => '?').join(', ')})`;
  const set = [
    ...VALUE_COLUMNS.map(c => `"${c}" = excluded."${c}"`),
    `"source" = excluded."source"`,
    `"import_id" = excluded."import_id"`,
    `"fetched_at" = excluded."fetched_at"`,
    `"updated_at" = excluded."updated_at"`,
    `"version" = "observation"."version" + 1`,
  ].join(', ');
  return (
    `INSERT INTO "observation" (${INSERT_COLUMNS.map(c => `"${c}"`).join(', ')}) VALUES ${Array(rowCount).fill(row).join(', ')}` +
    ` ON CONFLICT ("location_id", "time_utc") DO UPDATE SET ${set} WHERE ${UPDATE_CONDITION[mode]}` +
    ` RETURNING "time_utc"`
  );
}

function valuesOf(row: HourRow): ObservationValues {
  return {
    temperature: row.temperature,
    apparentTemperature: row.apparent_temperature,
    precipitation: row.precipitation,
    weatherCode: row.weather_code,
    windSpeed: row.wind_speed,
    windDirection: row.wind_direction,
  };
}

/** Zeile → Stunde; `timeLocal` bleibt bis zur Umstellung der Antworten Ortszeit ohne Offset (3a.9). */
function toHour(row: HourRow): ObservationHour {
  return { timeLocal: localDateTime(new Date(row.time_utc)), timeUtc: row.time_utc, ...valuesOf(row), source: row.source };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/**
 * `ObservationStore` auf SQLite (Schritt 9, Tabelle `observation`), gleiches Token wie der In-Memory-Store.
 *
 * - Lesen: eine Abfrage je Zeitraum über den Index `(location_id, local_date)`, sortiert nach `time_utc`;
 *   die Fachregeln (R06–R14, abhängig von „jetzt“) bleiben im `AggregationService`.
 * - Schreiben: Upsert in Blöcken zu 500 Zeilen in **einer** Transaktion (alles oder nichts),
 *   `ON CONFLICT (location_id, time_utc) DO UPDATE … WHERE (Werte unterscheiden sich) AND corrected_at IS NULL`
 *   (R20). Jede geänderte Zeile bekommt `updated_at = :now` und `version + 1`, neue `version = 1` (B2.4).
 * - R08: Eine Stunde, die nach dem Schreibzeitpunkt beginnt, wird als `source = "prediction"` gespeichert.
 */
@Injectable()
export class TypeOrmObservationStore implements ObservationStore {
  constructor(
    @InjectRepository(Observation) private readonly repository: Repository<Observation>,
    private readonly clock: Clock,
  ) {}

  async getDay(date: string): Promise<ObservationHour[] | null> {
    const rows: HourRow[] = await this.repository.query(
      `SELECT ${SELECT_HOUR} FROM "observation" WHERE "location_id" = ? AND "local_date" = ? ORDER BY "time_utc"`,
      [HEUBACH.id, date],
    );
    return rows.length > 0 ? rows.map(toHour) : null;
  }

  async getRange(from: string, to: string): Promise<StoredDay[]> {
    const rows: HourRow[] = await this.repository.query(
      `SELECT ${SELECT_HOUR} FROM "observation" WHERE "location_id" = ? AND "local_date" BETWEEN ? AND ? ORDER BY "time_utc"`,
      [HEUBACH.id, from, to],
    );
    const days: StoredDay[] = [];
    for (const row of rows) {
      const last = days[days.length - 1];
      if (last?.date === row.local_date) last.hours.push(toHour(row));
      else days.push({ date: row.local_date, hours: [toHour(row)] });
    }
    return days;
  }

  async getDataRange(): Promise<DataRange> {
    const [row]: { from: string | null; to: string | null }[] = await this.repository.query(
      `SELECT MIN("local_date") AS "from", MAX("local_date") AS "to" FROM "observation" WHERE "location_id" = ?`,
      [HEUBACH.id],
    );
    return { from: row?.from ?? null, to: row?.to ?? null };
  }

  /**
   * B2.4: `COUNT(*)` und `MAX(updated_at)`, dazu `SUM(version)`. Die Summe steigt mit jedem Update um 1, auch
   * wenn zwei Schreibvorgänge in dieselbe Sekunde fallen (gleiches `updated_at`) oder die Uhr steht (`FAKE_NOW`).
   */
  async getRevision(): Promise<string> {
    const [row]: { n: number; u: string | null; v: number }[] = await this.repository.query(
      `SELECT COUNT(*) AS "n", MAX("updated_at") AS "u", COALESCE(SUM("version"), 0) AS "v" FROM "observation" WHERE "location_id" = ?`,
      [HEUBACH.id],
    );
    return `${row.n}:${row.u ?? '-'}:${row.v}`;
  }

  async upsertHours(hours: readonly ObservationInput[], options: UpsertOptions): Promise<UpsertCounts> {
    const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 };
    const now = this.clock.now();
    const rows = this.toWriteRows(hours, now);
    if (rows.length === 0) return counts;

    const nowText = formatUtc(now);
    await this.repository.manager.transaction(async manager => {
      for (const block of chunk(rows, UPSERT_CHUNK_SIZE)) {
        const existing = await this.findExisting(manager, block);
        const params = block.flatMap(row => [
          HEUBACH.id,
          row.timeUtc,
          row.localDate,
          row.localHour,
          row.utcOffsetMin,
          row.values.temperature,
          row.values.apparentTemperature,
          row.values.precipitation,
          row.values.weatherCode,
          row.values.windSpeed,
          row.values.windDirection,
          row.source,
          options.importId,
          nowText,
          1,
          nowText,
        ]);
        const written: { time_utc: string }[] = await manager.query(upsertSql(block.length, options.mode), params);
        const writtenTimes = new Set(written.map(w => w.time_utc));

        for (const row of block) {
          const before = existing.get(row.timeUtc);
          if (!before) counts.inserted++;
          else if (writtenTimes.has(row.timeUtc)) counts.updated++;
          else if (before.corrected_at !== null && !sameValues(valuesOf(before), row.values)) counts.skippedCorrected++;
          else counts.unchanged++;
        }
      }
    });
    return counts;
  }

  /** Doppelte Zeitpunkte: der erste gewinnt (wie im In-Memory-Store); Ortsfelder über BerlinTime (03 B2.5). */
  private toWriteRows(hours: readonly ObservationInput[], now: Date): WriteRow[] {
    const seen = new Set<string>();
    const rows: WriteRow[] = [];
    for (const hour of hours) {
      const instant = new Date(hour.timeUtc);
      const timeUtc = formatUtc(instant);
      if (seen.has(timeUtc)) continue;
      seen.add(timeUtc);
      if (!hour.source) {
        throw new Error(`Stunde ${timeUtc} ohne Herkunft (source)`);
      }
      rows.push({
        timeUtc,
        localDate: localDate(instant),
        localHour: localHour(instant),
        utcOffsetMin: utcOffsetMinutes(instant),
        values: {
          temperature: hour.temperature,
          apparentTemperature: hour.apparentTemperature,
          precipitation: hour.precipitation,
          weatherCode: hour.weatherCode,
          windSpeed: hour.windSpeed,
          windDirection: hour.windDirection,
        },
        // R08: Stunde nach dem Abrufzeitpunkt = Vorhersage.
        source: instant.getTime() > now.getTime() ? 'prediction' : hour.source,
      });
    }
    return rows;
  }

  private async findExisting(manager: EntityManager, block: readonly WriteRow[]): Promise<Map<string, ExistingRow>> {
    const rows: ExistingRow[] = await manager.query(
      `SELECT ${SELECT_HOUR}, "corrected_at" FROM "observation" WHERE "location_id" = ? AND "time_utc" IN (${block.map(() => '?').join(', ')})`,
      [HEUBACH.id, ...block.map(row => row.timeUtc)],
    );
    return new Map(rows.map(row => [row.time_utc, row]));
  }
}
