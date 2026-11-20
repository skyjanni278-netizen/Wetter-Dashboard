import { Inject, Injectable } from '@nestjs/common';
import { BERLIN_TIMEZONE, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import type { ImportKind, ImportStatus } from '../imports/import';
import { IMPORT_STORE } from '../imports/import.store';
import type { ImportStore } from '../imports/import.store';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import type { Status, UpdateState } from './status';

/** R25: Ab diesem Alter des letzten erfolgreichen Imports gilt der Datenstand als verspätet (Annahme aus N01). */
export const UPDATE_DELAYED_AFTER_MS = 2 * 60 * 60 * 1000;

/** R25: Diese Importe zählen als Aktualisierung (`legacy` nicht). */
export const UPDATE_KINDS: readonly ImportKind[] = ['scheduled', 'range', 'gaps'];
export const UPDATE_STATUSES: readonly ImportStatus[] = ['succeeded', 'partial'];

/** R25: `ok` bis einschließlich 2 h nach dem letzten erfolgreichen Import, danach `delayed`. */
export function updateStateOf(lastSuccessfulUpdateAt: string | null, now: Date): UpdateState {
  if (lastSuccessfulUpdateAt === null) return 'never';
  return now.getTime() - Date.parse(lastSuccessfulUpdateAt) <= UPDATE_DELAYED_AFTER_MS ? 'ok' : 'delayed';
}

/** US07-1/-2: Datenstand, ohne Fehlertext. */
@Injectable()
export class StatusService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly observations: ObservationStore,
    @Inject(IMPORT_STORE) private readonly imports: ImportStore,
    private readonly clock: Clock,
  ) {}

  async find(): Promise<Status> {
    const range = await this.observations.getDataRange();
    const last = await this.imports.findLastFinished({
      locationId: HEUBACH.id,
      kinds: UPDATE_KINDS,
      statuses: UPDATE_STATUSES,
    });
    const now = this.clock.now();
    const lastSuccessfulUpdateAt = last?.finishedAt ?? null;
    return {
      locationId: HEUBACH.id,
      today: localDate(now),
      timezone: BERLIN_TIMEZONE,
      dataFrom: range.from,
      dataTo: range.to,
      lastSuccessfulUpdateAt,
      updateState: updateStateOf(lastSuccessfulUpdateAt, now),
    };
  }
}
