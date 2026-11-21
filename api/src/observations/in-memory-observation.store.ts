import { Inject, Injectable, Optional } from '@nestjs/common';
import { addDays, localDate, localDateTime } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { ACTIVE_FIXTURE } from '../fixtures/fixture';
import type { Fixture } from '../fixtures/fixture';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import type { LegacyDayFile, LegacyHour } from '../legacy/legacy-types';
import { pickValues, sameValues } from './observation';
import type {
  DataRange,
  ObservationHour,
  ObservationInput,
  ObservationSource,
  StoredDay,
  UpsertCounts,
} from './observation';
import type { ObservationStore, UpsertOptions } from './observation.store';

/** Von Nest importierte (oder aus einer Fixture geladene) Stunde, nur im Arbeitsspeicher. */
interface ImportedHour extends ObservationHour {
  timeUtc: string;
  /** Import, der die Stunde geschrieben hat; `null` bei Stunden aus einer Fixture. */
  importId: number | null;
  /** `true`, wenn die Stunde eine Stunde des Altbestands mit derselben Ortszeit ersetzt. */
  replacesLegacy: boolean;
}

/** Importierte Stunden eines Berliner Tages mit dem Zeitpunkt des letzten Schreibvorgangs (UTC). */
interface ImportedDay {
  writtenAt: string;
  hours: Map<string, ImportedHour>;
}

/**
 * Stunde des Altbestands. R08: Liegt ihre Ortszeit nach der Änderungszeit der Datei, war sie beim
 * Schreiben eine Vorhersage (`source = "prediction"`), auch wenn ihre Zeit inzwischen vorbei ist
 * (veraltete Vorhersage, Befund Z3). Sonst ist die Herkunft unbekannt (`null`, bis Schritt 9).
 */
function fromLegacy(hour: LegacyHour, modifiedAt: string | null): ObservationHour {
  const writtenLocal = modifiedAt ? localDateTime(new Date(modifiedAt)) : null;
  const source: ObservationSource | null = writtenLocal !== null && hour.time > writtenLocal ? 'prediction' : null;
  return { timeLocal: hour.time, timeUtc: null, ...pickValues(hour), source };
}

function toHour(hour: ImportedHour): ObservationHour {
  return { timeLocal: hour.timeLocal, timeUtc: hour.timeUtc, ...pickValues(hour), source: hour.source };
}

function compareHours(a: ObservationHour, b: ObservationHour): number {
  if (a.timeLocal !== b.timeLocal) return a.timeLocal < b.timeLocal ? -1 : 1;
  const ua = a.timeUtc ?? '';
  const ub = b.timeUtc ?? '';
  return ua === ub ? 0 : ua < ub ? -1 : 1;
}

function byTimeUtc(a: { timeUtc: string }, b: { timeUtc: string }): number {
  return a.timeUtc === b.timeUtc ? 0 : a.timeUtc < b.timeUtc ? -1 : 1;
}

/**
 * Altbestand plus importierte Stunden. Eine importierte Stunde mit `replacesLegacy` ersetzt die erste
 * Stunde des Altbestands mit derselben Ortszeit; alle übrigen kommen hinzu.
 */
function mergeDay(file: LegacyDayFile | null, imported: readonly ImportedHour[]): ObservationHour[] {
  const result = (file?.hours ?? []).map(h => fromLegacy(h, file?.modifiedAt ?? null));
  const added: ObservationHour[] = [];
  for (const hour of [...imported].sort(byTimeUtc)) {
    if (hour.replacesLegacy) {
      const index = result.findIndex(h => h.timeUtc === null && h.timeLocal === hour.timeLocal);
      if (index >= 0) {
        result[index] = toHour(hour);
        continue;
      }
    }
    added.push(toHour(hour));
  }
  return [...result, ...added].sort(compareHours);
}

/**
 * `ObservationStore` im Arbeitsspeicher (Schritt 3). Seit Schritt 9 nur noch für Unit-Tests und den Testpfad
 * mit Altdateien (`test/support/legacy-stores.ts`); die App nutzt den `TypeOrmObservationStore`.
 *
 * - Grundlage ist der Altbestand aus `LegacyFileSource`. Die Datei für heute liest diese bei jeder
 *   Anfrage neu; das bleibt erhalten, weil der Store bei jedem Lesen über `LegacyFileSource` geht.
 * - Mit einer Fixture (Token `ACTIVE_FIXTURE`) ist die Fixture die Grundlage, der Altbestand wird
 *   nicht gelesen. Ihre Stunden verhalten sich wie importierte Stunden.
 * - Importe von Nest liegen getrennt daneben. Für ältere Tage haben sie Vorrang vor dem Altbestand.
 * - Für **heute** gilt die neuere Quelle: Ist die Tagesdatei von Express (Änderungszeit) neuer als der
 *   letzte Schreibvorgang eines Imports für diesen Tag, gilt nur die Datei und die importierten Stunden
 *   des Tages werden verworfen. So friert ein Import die stündlich aktualisierte Datei nicht ein.
 * - R08: Eine Stunde, die beim Schreiben in der Zukunft lag, wird als `source = "prediction"` gespeichert.
 * - Schreibt **nie** in Dateien: Express bleibt bis Schritt 9 der einzige Schreiber.
 */
@Injectable()
export class InMemoryObservationStore implements ObservationStore {
  /** Berliner Datum → Schreibzeitpunkt und (UTC-Zeitpunkt → Stunde). */
  private readonly imported = new Map<string, ImportedDay>();
  private readonly useLegacy: boolean;

  constructor(
    private readonly legacy: LegacyFileSource,
    private readonly clock: Clock,
    @Optional() @Inject(ACTIVE_FIXTURE) fixture: Fixture | null = null,
  ) {
    this.useLegacy = fixture === null;
    if (fixture) this.seed(fixture);
  }

  async getDay(date: string): Promise<ObservationHour[] | null> {
    const file = this.useLegacy ? await this.legacy.getDayFile(date) : null;
    const imported = this.currentImported(date, file);
    if (!file && !imported) return null;
    return mergeDay(file, imported ? [...imported.hours.values()] : []);
  }

  async getRange(from: string, to: string): Promise<StoredDay[]> {
    const days: StoredDay[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const hours = await this.getDay(date);
      if (hours && hours.length > 0) days.push({ date, hours });
    }
    return days;
  }

  /** Importierte Stunden eines Tages, außer sie sind heute von einer neueren Express-Datei überholt. */
  private currentImported(date: string, file: LegacyDayFile | null): ImportedDay | undefined {
    const imported = this.imported.get(date);
    if (
      imported &&
      file?.modifiedAt &&
      date === localDate(this.clock.now()) &&
      Date.parse(file.modifiedAt) > Date.parse(imported.writtenAt)
    ) {
      this.imported.delete(date);
      return undefined;
    }
    return imported;
  }

  async getDataRange(): Promise<DataRange> {
    let { from, to } = this.useLegacy ? await this.legacy.getDataRange() : { from: null, to: null };
    for (const date of this.imported.keys()) {
      if (from === null || date < from) from = date;
      if (to === null || date > to) to = date;
    }
    return { from, to };
  }

  /** Nie zwischenspeicherbar: die Datei für heute ändert sich ohne Schreibvorgang dieses Stores. */
  async getRevision(): Promise<string | null> {
    return null;
  }

  async upsertHours(hours: readonly ObservationInput[], options: UpsertOptions): Promise<UpsertCounts> {
    // Korrekturen gibt es hier nicht (Schritt 12a, nur im TypeORM-Store): `skippedCorrected` bleibt 0.
    const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 };
    const now = this.clock.now();
    const byDate = new Map<string, ObservationInput[]>();
    const seen = new Set<string>();
    for (const hour of hours) {
      if (seen.has(hour.timeUtc)) continue;
      seen.add(hour.timeUtc);
      const date = localDate(new Date(hour.timeUtc));
      const list = byDate.get(date) ?? [];
      list.push(hour);
      byDate.set(date, list);
    }

    // Erst alle Änderungen berechnen, dann gemeinsam übernehmen (alles oder nichts).
    const changes: [string, ImportedHour][] = [];
    for (const [date, incoming] of byDate) {
      const current = (await this.getDay(date)) ?? [];
      const importedOfDay = this.imported.get(date);
      const claimed = new Set<number>();

      for (const input of [...incoming].sort(byTimeUtc)) {
        const timeLocal = localDateTime(new Date(input.timeUtc));
        let replacesLegacy = false;
        let index = current.findIndex(h => h.timeUtc === input.timeUtc);
        if (index >= 0) {
          replacesLegacy = importedOfDay?.hours.get(input.timeUtc)?.replacesLegacy ?? false;
        } else {
          index = current.findIndex(
            (h, i) => h.timeUtc === null && h.timeLocal === timeLocal && !claimed.has(i),
          );
          if (index >= 0) {
            claimed.add(index);
            replacesLegacy = true;
          }
        }

        // R08: Stunde nach dem Abrufzeitpunkt = Vorhersage.
        const source: ObservationSource | null =
          Date.parse(input.timeUtc) > now.getTime() ? 'prediction' : (input.source ?? null);
        const next: ImportedHour = {
          timeLocal,
          timeUtc: input.timeUtc,
          ...pickValues(input),
          source,
          importId: options.importId,
          replacesLegacy,
        };
        if (index < 0) {
          counts.inserted++;
          changes.push([date, next]);
          continue;
        }
        const wasPrediction = current[index].source === 'prediction';
        const isPrediction = source === 'prediction';
        if (wasPrediction && !isPrediction) {
          // Eine (veraltete) Vorhersage gilt als Lücke (R08) und wird auch von `gaps` ersetzt.
          counts.updated++;
          changes.push([date, next]);
        } else if (options.mode === 'insertMissing' || (sameValues(current[index], input) && wasPrediction === isPrediction)) {
          counts.unchanged++;
        } else {
          counts.updated++;
          changes.push([date, next]);
        }
      }
    }

    const writtenAt = formatUtc(now);
    for (const [date, hour] of changes) {
      const day = this.imported.get(date) ?? { writtenAt, hours: new Map<string, ImportedHour>() };
      day.writtenAt = writtenAt;
      day.hours.set(hour.timeUtc, hour);
      this.imported.set(date, day);
    }
    return counts;
  }

  /** Lädt die Stunden einer Fixture als Grundlage (statt des Altbestands). */
  private seed(fixture: Fixture): void {
    const writtenAt = formatUtc(this.clock.now());
    for (const observation of fixture.observations) {
      const instant = new Date(observation.timeUtc);
      const date = localDate(instant);
      const day = this.imported.get(date) ?? { writtenAt, hours: new Map<string, ImportedHour>() };
      day.hours.set(observation.timeUtc, {
        timeLocal: localDateTime(instant),
        timeUtc: observation.timeUtc,
        ...pickValues(observation),
        source: observation.source,
        importId: null,
        replacesLegacy: false,
      });
      this.imported.set(date, day);
    }
  }
}
