import type { DataSource, EntityManager } from 'typeorm';
import { localDate, localHour, utcOffsetMinutes } from '../../common/berlin-time';
import { formatUtc } from '../../common/utc';
import type { Fixture } from '../../fixtures/fixture';
import type { ImportKind } from '../../imports/import';
import { HEUBACH } from '../../locations/location';
import { CORRECTION_COLUMNS } from '../../observations/correction';

export interface SeedSummary {
  name: string;
  observations: number;
  imports: number;
  forecastDays: number;
  /** Einträge in `correction` (Schritt 12a, Fixtures mit `corrections`). */
  corrections: number;
  days: string[];
}

/** Konto für `correction.corrected_by` (FK auf `user`): der erste Admin; ohne Konto gibt es keine Korrekturen. */
async function correctionAuthor(manager: EntityManager, seed: Fixture): Promise<number> {
  const [row]: { id: number }[] = await manager.query(
    `SELECT "u"."id" FROM "user" "u" JOIN "user_role" "ur" ON "ur"."user_id" = "u"."id"
     JOIN "role" "r" ON "r"."id" = "ur"."role_id" WHERE "r"."name" = 'admin' ORDER BY "u"."id" LIMIT 1`,
  );
  if (!row) {
    throw new Error(
      `Die Fixture "${seed.name}" enthält Korrekturen; dafür braucht die DB ein Admin-Konto (DEV_ADMIN_PASSWORD setzen oder npm run cli -- admin:create).`,
    );
  }
  return row.id;
}

/**
 * Seeds dürfen keine Importe `legacy`/`scheduled` anlegen: Genau diese Arten kennzeichnen gesammelte Daten
 * (03 B4.4), und der nächste `db:seed`/`db:reset` würde sich sonst verweigern. Für den Datenstand (R25) zählt
 * `range` wie `scheduled`, `updateState` bleibt also gleich.
 */
export function seedKind(kind: ImportKind): ImportKind {
  return kind === 'legacy' || kind === 'scheduled' ? 'range' : kind;
}

/** Tabellen mit Daten in der Reihenfolge, in der sie gelöscht werden dürfen (Fremdschlüssel). */
const DATA_TABLES = ['correction', 'observation', 'daily_forecast', 'import'] as const;

async function clearData(manager: EntityManager): Promise<void> {
  for (const table of DATA_TABLES) await manager.query(`DELETE FROM "${table}"`);
  // IDs wieder ab 1 (wie eine frische DB); `sqlite_sequence` gibt es nach dem ersten AUTOINCREMENT-Insert.
  await manager.query(`DELETE FROM "sqlite_sequence" WHERE "name" IN (${DATA_TABLES.map(t => `'${t}'`).join(', ')})`);
}

/**
 * Schreibt einen Seed (Dev-Seed oder Fixture) in die Datenbank, in **einer** Transaktion: erst alle Daten
 * löschen (der Standort bleibt), dann Importe, Stunden und Vorhersage anlegen. Die Stunden übernehmen `source`
 * aus der Datei (auch `prediction`) und hängen am letzten Import; ohne Import der Datei entsteht ein Import
 * `range`. Korrekturen der Fixture (Schritt 12a) brauchen ein Admin-Konto in der DB (`corrected_by`, FK auf
 * `user`); fehlt es, bricht der Seed ohne Änderung ab. Den Schutz der gesammelten Daten prüft der Aufrufer vorher
 * (`assertMayDeleteData`).
 */
export async function applySeed(dataSource: DataSource, seed: Fixture, now: Date): Promise<SeedSummary> {
  const nowText = formatUtc(now);
  const imports =
    seed.imports.length > 0
      ? seed.imports
      : [
          {
            kind: 'range' as const,
            status: 'succeeded' as const,
            from: seed.observations[0] ? localDate(new Date(seed.observations[0].timeUtc)) : localDate(now),
            to: seed.observations.length > 0 ? localDate(new Date(seed.observations[seed.observations.length - 1].timeUtc)) : localDate(now),
            requestedAt: seed.fakeNow ?? nowText,
            startedAt: seed.fakeNow ?? nowText,
            finishedAt: seed.fakeNow ?? nowText,
          },
        ];

  return dataSource.transaction(async manager => {
    await clearData(manager);

    let lastImportId = 0;
    let lastFinishedAt = nowText;
    for (const entry of imports) {
      const [row]: { id: number }[] = await manager.query(
        `INSERT INTO "import" ("location_id", "kind", "status", "from_date", "to_date", "requested_at", "started_at", "finished_at")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING "id"`,
        [HEUBACH.id, seedKind(entry.kind), entry.status, entry.from, entry.to, entry.requestedAt, entry.startedAt, entry.finishedAt],
      );
      lastImportId = row.id;
      lastFinishedAt = entry.finishedAt;
    }

    const days = new Set<string>();
    for (const hour of seed.observations) {
      const instant = new Date(hour.timeUtc);
      const date = localDate(instant);
      days.add(date);
      await manager.query(
        `INSERT INTO "observation" ("location_id", "time_utc", "local_date", "local_hour", "utc_offset_min", "temperature",
           "apparent_temperature", "precipitation", "weather_code", "wind_speed", "wind_direction", "source", "import_id",
           "fetched_at", "version", "updated_at")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          HEUBACH.id,
          formatUtc(instant),
          date,
          localHour(instant),
          utcOffsetMinutes(instant),
          hour.temperature,
          hour.apparentTemperature,
          hour.precipitation,
          hour.weatherCode,
          hour.windSpeed,
          hour.windDirection,
          hour.source,
          lastImportId,
          lastFinishedAt,
          nowText,
        ],
      );
    }

    // Schritt 12a: schon durchgeführte Korrekturen (Wert in `observations[]` = `newValue`), in zeitlicher Reihenfolge.
    const corrections = [...(seed.corrections ?? [])].sort((a, b) => a.correctedAt.localeCompare(b.correctedAt));
    if (corrections.length > 0) {
      const author = await correctionAuthor(manager, seed);
      for (const correction of corrections) {
        const [observation]: { id: number }[] = await manager.query(
          `UPDATE "observation" SET "corrected_at" = ?, "version" = "version" + 1 WHERE "location_id" = ? AND "time_utc" = ? RETURNING "id"`,
          [correction.correctedAt, HEUBACH.id, correction.timeUtc],
        );
        if (!observation) throw new Error(`Korrektur der Fixture "${seed.name}": keine Stunde ${correction.timeUtc}.`);
        await manager.query(
          `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            observation.id,
            CORRECTION_COLUMNS[correction.field],
            correction.oldValue,
            correction.newValue,
            correction.reason,
            author,
            correction.correctedAt,
          ],
        );
      }
    }

    for (const day of seed.forecast?.days ?? []) {
      await manager.query(
        `INSERT INTO "daily_forecast" ("location_id", "date", "max_temp", "min_temp", "precipitation_sum", "weather_code", "fetched_at", "import_id")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [HEUBACH.id, day.date, day.maxTemp, day.minTemp, day.precipitationSum, day.weatherCode, seed.forecast!.fetchedAt, lastImportId],
      );
    }

    return {
      name: seed.name,
      observations: seed.observations.length,
      imports: imports.length,
      forecastDays: seed.forecast?.days.length ?? 0,
      corrections: corrections.length,
      days: [...days].sort(),
    };
  });
}
