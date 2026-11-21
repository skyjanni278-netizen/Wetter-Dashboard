import { Inject, Injectable } from '@nestjs/common';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Cache im Arbeitsspeicher für teure Lesemodelle (`records`, `summaries/years`), 03 B2.4 und B4.5.
 *
 * Schlüssel = Datenrevision des `ObservationStore` plus die laufende UTC-Stunde. Die Revision ändert sich mit
 * jedem Schreibvorgang (Import, später Korrektur), der Cache ist dann von selbst ungültig; ein Event-Bus ist
 * nicht nötig. Die Stunde gehört dazu, weil die Ergebnisse von „jetzt“ abhängen: R08 wechselt nur zu vollen
 * Stunden, „heute“ und damit R13 nur um Mitternacht (ebenfalls eine volle UTC-Stunde).
 * Liefert der Store keine Revision (`null`, In-Memory-Store), wird jedes Mal neu gerechnet.
 */
@Injectable()
export class RevisionCache {
  private readonly entries = new Map<string, { key: string; value: unknown }>();

  constructor(@Inject(OBSERVATION_STORE) private readonly store: ObservationStore) {}

  async get<T>(name: string, now: Date, compute: () => Promise<T>): Promise<T> {
    const revision = await this.store.getRevision();
    if (revision === null) return compute();

    const key = `${revision}|${Math.floor(now.getTime() / HOUR_MS)}`;
    const entry = this.entries.get(name);
    if (entry?.key === key) return entry.value as T;

    const value = await compute();
    this.entries.set(name, { key, value });
    return value;
  }
}
