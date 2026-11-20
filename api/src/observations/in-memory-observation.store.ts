import { Injectable } from '@nestjs/common';
import { localDate, localDateTime } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import type { LegacyDayFile, LegacyHour } from '../legacy/legacy-types';
import { pickValues, sameValues } from './observation';
import type { DataRange, ObservationHour, ObservationInput, UpsertCounts } from './observation';
import type { ObservationStore, UpsertOptions } from './observation.store';

/** Von Nest importierte Stunde (nur im Arbeitsspeicher). */
interface ImportedHour extends ObservationHour {
  timeUtc: string;
  importId: number;
  /** `true`, wenn die Stunde eine Stunde des Altbestands mit derselben Ortszeit ersetzt. */
  replacesLegacy: boolean;
}

/** Importierte Stunden eines Berliner Tages mit dem Zeitpunkt des letzten Schreibvorgangs (UTC). */
interface ImportedDay {
  writtenAt: string;
  hours: Map<string, ImportedHour>;
}

function fromLegacy(hour: LegacyHour): ObservationHour {
  return { timeLocal: hour.time, timeUtc: null, ...pickValues(hour) };
}

function toHour(hour: ImportedHour): ObservationHour {
  return { timeLocal: hour.timeLocal, timeUtc: hour.timeUtc, ...pickValues(hour) };
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
function mergeDay(base: readonly LegacyHour[], imported: readonly ImportedHour[]): ObservationHour[] {
  const result = base.map(fromLegacy);
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
 * `ObservationStore` im Arbeitsspeicher (Schritt 3, bis Schritt 9).
 *
 * - Grundlage ist der Altbestand aus `LegacyFileSource`. Die Datei für heute liest diese bei jeder
 *   Anfrage neu; das bleibt erhalten, weil der Store bei jedem Lesen über `LegacyFileSource` geht.
 * - Importe von Nest liegen getrennt daneben. Für ältere Tage haben sie Vorrang vor dem Altbestand.
 * - Für **heute** gilt die neuere Quelle: Ist die Tagesdatei von Express (Änderungszeit) neuer als der
 *   letzte Schreibvorgang eines Imports für diesen Tag, gilt nur die Datei und die importierten Stunden
 *   des Tages werden verworfen. So friert ein Import die stündlich aktualisierte Datei nicht ein.
 * - Schreibt **nie** in Dateien: Express bleibt bis Schritt 9 der einzige Schreiber.
 */
@Injectable()
export class InMemoryObservationStore implements ObservationStore {
  /** Berliner Datum → Schreibzeitpunkt und (UTC-Zeitpunkt → Stunde). */
  private readonly imported = new Map<string, ImportedDay>();

  constructor(
    private readonly legacy: LegacyFileSource,
    private readonly clock: Clock,
  ) {}

  async getDay(date: string): Promise<ObservationHour[] | null> {
    const file = await this.legacy.getDayFile(date);
    const imported = this.currentImported(date, file);
    if (!file && !imported) return null;
    return mergeDay(file?.hours ?? [], imported ? [...imported.hours.values()] : []);
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
    let { from, to } = await this.legacy.getDataRange();
    for (const date of this.imported.keys()) {
      if (from === null || date < from) from = date;
      if (to === null || date > to) to = date;
    }
    return { from, to };
  }

  async upsertHours(hours: readonly ObservationInput[], options: UpsertOptions): Promise<UpsertCounts> {
    const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
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

        const next: ImportedHour = {
          timeLocal,
          timeUtc: input.timeUtc,
          ...pickValues(input),
          importId: options.importId,
          replacesLegacy,
        };
        if (index < 0) {
          counts.inserted++;
          changes.push([date, next]);
        } else if (options.mode === 'insertMissing' || sameValues(current[index], input)) {
          counts.unchanged++;
        } else {
          counts.updated++;
          changes.push([date, next]);
        }
      }
    }

    const writtenAt = formatUtc(this.clock.now());
    for (const [date, hour] of changes) {
      const day = this.imported.get(date) ?? { writtenAt, hours: new Map<string, ImportedHour>() };
      day.writtenAt = writtenAt;
      day.hours.set(hour.timeUtc, hour);
      this.imported.set(date, day);
    }
    return counts;
  }
}
