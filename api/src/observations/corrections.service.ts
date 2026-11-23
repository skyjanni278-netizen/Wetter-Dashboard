import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { assertNotInFuture } from '../common/api-validation.exception';
import { addDays, localDate, localDateTimeWithOffset, startOfDayUtc } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { HEUBACH } from '../locations/location';
import { CORRECTION_COLUMNS, fieldOfColumn, hasEffectiveCorrection, notReversibleReason, toCorrectionResource } from './correction';
import type { CorrectionFieldName, CorrectionHistory, CorrectionList, CorrectionRow } from './correction';
import type { CorrectionField } from './correction.entity';
import { MEASUREMENT_FIELDS } from './dto/observation-patch.schema';
import type { ObservationPatch } from './dto/observation-patch.schema';
import type { CorrectionsQuery } from './dto/corrections-query.schema';
import { isPredictionRow, OBSERVATION_ROW_COLUMNS, toObservationResource, valuesOfRow } from './observation-resource';
import type { ObservationResource, ObservationRow } from './observation-resource';

const CORRECTION_COLUMNS_SQL =
  '"id", "observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at", "reverts_correction_id"';

/** Code eines SQLite-Fehlers (better-sqlite3 direkt oder als TypeORM `QueryFailedError.driverError`). */
function sqliteCode(error: unknown): string | undefined {
  for (const candidate of [error, (error as { driverError?: unknown } | null)?.driverError]) {
    const code = typeof candidate === 'object' && candidate !== null ? (candidate as { code?: unknown }).code : undefined;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Eine Änderung an einem Feld: Spalte, alter und neuer Wert. */
interface FieldChange {
  column: CorrectionField;
  oldValue: number | null;
  newValue: number | null;
}

/**
 * N03 (US13): Stunden lesen, korrigieren und Korrekturen zurücknehmen, mit Änderungsprotokoll in `correction`.
 *
 * - **Optimistisches Sperren (R17, B3.4):** Jeder Schreibweg ist `UPDATE observation SET …, updated_at = :now,
 *   version = version + 1 WHERE id = ? AND version = ?`. Passt die Version nicht (vorher geprüft oder 0 Zeilen
 *   betroffen) → 412. `updated_at` und `version` ändern die Datenrevision, der Cache von `records` und
 *   `summaries/years` ist damit sofort ungültig (B2.4, US13-13).
 * - **Eine Transaktion** je Vorgang: Update der Stunde und alle Einträge in `correction` (ein Eintrag je
 *   geändertem Feld) gelingen zusammen oder gar nicht.
 * - **R08:** Eine Vorhersagestunde (gespeichert als `prediction` oder nach „jetzt“) wird nie korrigiert → 409.
 * - **R33:** Rücknahme der jüngsten noch nicht zurückgenommenen Korrektur eines Felds; `corrected_at = NULL`,
 *   wenn danach keine wirksame Korrektur bleibt.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  /** US13-1: eine Stunde; unbekannt → 404. */
  async findObservation(id: number): Promise<ObservationResource> {
    const row = await this.requireObservation(this.dataSource.manager, id);
    return toObservationResource(row, this.clock.now());
  }

  /** US13-11: Historie einer Stunde, neueste zuerst; unbekannte Stunde → 404. */
  async history(id: number): Promise<CorrectionHistory> {
    await this.requireObservation(this.dataSource.manager, id);
    const rows: CorrectionRow[] = await this.dataSource.query(
      `SELECT ${CORRECTION_COLUMNS_SQL} FROM "correction" WHERE "observation_id" = ? ORDER BY "corrected_at" DESC, "id" DESC`,
      [id],
    );
    return { items: rows.map(toCorrectionResource) };
  }

  /**
   * US13-14 (R23, R24): Korrekturen, deren `correctedAt` auf einen Berliner Kalendertag `from`–`to` fällt,
   * nach `correctedAt` absteigend (Gleichstand: `id` absteigend). `to` nach heute → 400 `DATE_IN_FUTURE`.
   * Liest nur; über den Index `IDX_correction_corrected_at`.
   */
  async findPage(query: CorrectionsQuery): Promise<CorrectionList> {
    const { from, to, page, limit } = query;
    assertNotInFuture('to', to, localDate(this.clock.now()));
    const start = formatUtc(startOfDayUtc(from));
    const end = formatUtc(startOfDayUtc(addDays(to, 1)));
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS "total" FROM "correction" WHERE "corrected_at" >= ? AND "corrected_at" < ?`,
      [start, end],
    );
    const rows: (CorrectionRow & { time_utc: string })[] = await this.dataSource.query(
      `SELECT ${CORRECTION_COLUMNS_SQL.split(', ').map(c => `"c".${c}`).join(', ')}, "o"."time_utc"
       FROM "correction" "c" JOIN "observation" "o" ON "o"."id" = "c"."observation_id"
       WHERE "c"."corrected_at" >= ? AND "c"."corrected_at" < ?
       ORDER BY "c"."corrected_at" DESC, "c"."id" DESC LIMIT ? OFFSET ?`,
      [start, end, limit, (page - 1) * limit],
    );
    return {
      items: rows.map(row => {
        const { id, observationId, ...rest } = toCorrectionResource(row);
        return { id, observationId, observationTimeLocal: localDateTimeWithOffset(new Date(row.time_utc)), ...rest };
      }),
      meta: { page, limit, total },
    };
  }

  /**
   * US13-2 bis -8 (R08, R16, R17): ändert die angegebenen Messwerte. Je Feld, dessen Wert sich wirklich ändert,
   * entsteht ein Eintrag in `correction`; `corrected_at = :now`. Ändert sich kein Wert, bleibt die Stunde
   * unverändert (keine neue Version, kein Eintrag), die Versionsprüfung gilt trotzdem.
   */
  async correct(
    id: number,
    expectedVersions: readonly number[],
    patch: ObservationPatch,
    correctedBy: number,
  ): Promise<ObservationResource> {
    const now = this.clock.now();
    const nowText = formatUtc(now);
    return this.write(async manager => {
      const row = await this.requireObservation(manager, id);
      if (isPredictionRow(row, now)) throw ApiException.observationIsPrediction(id);
      this.assertVersion(row, expectedVersions);

      const current = valuesOfRow(row);
      const changes: FieldChange[] = MEASUREMENT_FIELDS.filter(
        field => patch[field] !== undefined && patch[field] !== current[field],
      ).map(field => ({ column: CORRECTION_COLUMNS[field], oldValue: current[field], newValue: patch[field] ?? null }));
      if (changes.length === 0) return toObservationResource(row, now);

      const updated = await this.update(manager, row, changes, nowText, nowText);
      for (const change of changes) {
        await this.insertCorrection(manager, id, change, patch.reason, correctedBy, nowText, null);
      }
      return toObservationResource(updated, now);
    });
  }

  /**
   * US13-16 bis -18 (R33): nimmt die Korrektur `correctionId` der Stunde `id` zurück. Feld = `oldValue` der
   * Korrektur, neuer Eintrag mit `revertsCorrectionId`, `version + 1`, `updated_at` neu. Korrektur unbekannt
   * oder von einer anderen Stunde → 404; nicht rücknehmbar → 409 `CORRECTION_NOT_REVERSIBLE`; Version → 412.
   */
  async revert(
    id: number,
    correctionId: number,
    expectedVersions: readonly number[],
    reason: string,
    correctedBy: number,
  ): Promise<ObservationResource> {
    const now = this.clock.now();
    const nowText = formatUtc(now);
    return this.write(async manager => {
      const row = await this.requireObservation(manager, id);
      const entries: CorrectionRow[] = await manager.query(
        `SELECT ${CORRECTION_COLUMNS_SQL} FROM "correction" WHERE "observation_id" = ? ORDER BY "id"`,
        [id],
      );
      const target = entries.find(entry => entry.id === correctionId);
      if (!target) throw ApiException.notFound(`Die Korrektur ${correctionId} gibt es zur Stunde ${id} nicht.`);

      const current = valuesOfRow(row);
      const problem = notReversibleReason(target, entries, current);
      if (problem) throw ApiException.correctionNotReversible(correctionId, problem);
      this.assertVersion(row, expectedVersions);

      const field: CorrectionFieldName = fieldOfColumn(target.field);
      const change: FieldChange = { column: target.field, oldValue: current[field], newValue: target.old_value };
      const reversal: CorrectionRow = {
        id: Number.MAX_SAFE_INTEGER,
        observation_id: id,
        field: target.field,
        old_value: change.oldValue,
        new_value: change.newValue,
        reason,
        corrected_by: correctedBy,
        corrected_at: nowText,
        reverts_correction_id: target.id,
      };
      const stillCorrected = hasEffectiveCorrection([...entries, reversal], { ...current, [field]: change.newValue });
      const updated = await this.update(manager, row, [change], stillCorrected ? row.corrected_at : null, nowText);
      await this.insertCorrection(manager, id, change, reason, correctedBy, nowText, target.id);
      return toObservationResource(updated, now);
    });
  }

  /**
   * Transaktion mit Abbildung der DB-Fehler: Fremdschlüssel (nur `corrected_by` kann fehlen: Konto gelöscht,
   * Token noch gültig) → 401; `UNIQUE(reverts_correction_id)` (zwei gleichzeitige Rücknahmen) → 409 (R33).
   */
  private async write<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      const code = sqliteCode(error);
      if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new ApiException(401, 'UNAUTHENTICATED', 'Das Konto gibt es nicht mehr. Bitte neu anmelden.', { cause: error });
      }
      if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiException(409, 'CORRECTION_NOT_REVERSIBLE', 'Die Korrektur wurde inzwischen schon zurückgenommen.', {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async requireObservation(manager: EntityManager, id: number): Promise<ObservationRow> {
    const [row]: ObservationRow[] = await manager.query(
      `SELECT ${OBSERVATION_ROW_COLUMNS} FROM "observation" WHERE "id" = ? AND "location_id" = ?`,
      [id, HEUBACH.id],
    );
    if (!row) throw ApiException.notFound(`Die Stunde ${id} gibt es nicht.`);
    return row;
  }

  /** R17: `If-Match` muss die aktuelle Version nennen. */
  private assertVersion(row: ObservationRow, expectedVersions: readonly number[]): void {
    if (!expectedVersions.includes(row.version)) throw ApiException.preconditionFailed(row.version);
  }

  /**
   * B3.4: `UPDATE … SET <Felder>, corrected_at, updated_at = :now, version = version + 1 WHERE id = ? AND
   * version = ?`. Die Spaltennamen kommen nur aus `CORRECTION_COLUMNS` (keine Eingabe im SQL). 0 Zeilen → 412.
   */
  private async update(
    manager: EntityManager,
    row: ObservationRow,
    changes: readonly FieldChange[],
    correctedAt: string | null,
    nowText: string,
  ): Promise<ObservationRow> {
    const set = changes.map(change => `"${change.column}" = ?`).join(', ');
    const [updated]: ObservationRow[] = await manager.query(
      `UPDATE "observation" SET ${set}, "corrected_at" = ?, "updated_at" = ?, "version" = "version" + 1
       WHERE "id" = ? AND "version" = ? RETURNING ${OBSERVATION_ROW_COLUMNS}`,
      [...changes.map(change => change.newValue), correctedAt, nowText, row.id, row.version],
    );
    if (!updated) {
      // Zwischen Lesen und Schreiben geändert (sonst unmöglich, die Transaktion hält die Zeile nicht fest).
      const [now]: { version: number }[] = await manager.query(`SELECT "version" FROM "observation" WHERE "id" = ?`, [row.id]);
      throw ApiException.preconditionFailed(now?.version ?? row.version);
    }
    return updated;
  }

  private async insertCorrection(
    manager: EntityManager,
    observationId: number,
    change: FieldChange,
    reason: string,
    correctedBy: number,
    nowText: string,
    revertsCorrectionId: number | null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "correction" ("observation_id", "field", "old_value", "new_value", "reason", "corrected_by", "corrected_at", "reverts_correction_id")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [observationId, change.column, change.oldValue, change.newValue, reason, correctedBy, nowText, revertsCorrectionId],
    );
  }
}
