import { Inject, Injectable } from '@nestjs/common';
import { assertNotInFuture } from '../common/api-validation.exception';
import { addDays, localDate, localDateTimeWithOffset, startOfDayUtc } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { formatUtc } from '../common/utc';
import type { Gap, GapList, GapReason } from './gap';
import type { ObservationHour } from './observation';
import { OBSERVATION_STORE } from './observation.store';
import type { ObservationStore } from './observation.store';

const HOUR_MS = 60 * 60 * 1000;

/** Grund, warum eine vergangene Stunde eine Lücke ist, oder `null` (Messwert vorhanden). */
function reasonOf(hour: ObservationHour | undefined): GapReason | null {
  if (!hour) return 'missing';
  if (hour.source === 'prediction') return 'stale_prediction';
  if (hour.temperature === null || hour.precipitation === null) return 'null_values';
  return null;
}

/**
 * US12-1/-2/-3, US14-1: Lücken im Zeitraum `from`–`to` (Berliner Kalendertage, beide eingeschlossen).
 *
 * - Geprüft werden nur Stunden, die **vorbei** sind (Ende ≤ jetzt). Die laufende Stunde zählt noch nicht:
 *   Bis zum stündlichen Abruf (Minute 5) ist sie nur als Vorhersage da, sonst stünde jede Stunde kurz eine
 *   Lücke `stale_prediction` in der Liste.
 * - Erwartet wird jede UTC-Stunde der Berliner Tage (23/24/25, R07); aufeinanderfolgende Stunden mit
 *   demselben Grund bilden eine Lücke.
 * - Form und Spanne prüft vorher `GapsQuerySchema`; hier R02: `to` nach heute → 400 `DATE_IN_FUTURE` an `to`.
 */
@Injectable()
export class GapsService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly clock: Clock,
  ) {}

  async find(from: string, to: string): Promise<GapList> {
    const now = this.clock.now();
    assertNotInFuture('to', to, localDate(now));

    const byUtc = new Map<string, ObservationHour>();
    for (const day of await this.store.getRange(from, to)) {
      for (const hour of day.hours) {
        if (hour.timeUtc !== null) byUtc.set(hour.timeUtc, hour);
      }
    }

    const items: Gap[] = [];
    let current: { start: Date; last: Date; hours: number; reason: GapReason } | null = null;
    const end = Math.min(startOfDayUtc(addDays(to, 1)).getTime(), now.getTime() - HOUR_MS + 1);
    for (let t = startOfDayUtc(from).getTime(); t < end; t += HOUR_MS) {
      const instant = new Date(t);
      const hour = byUtc.get(formatUtc(instant));
      const reason = reasonOf(hour);
      if (current && reason === current.reason) {
        current.last = instant;
        current.hours++;
        continue;
      }
      if (current) items.push(toGap(current));
      current = reason ? { start: instant, last: instant, hours: 1, reason } : null;
    }
    if (current) items.push(toGap(current));
    return { items };
  }
}

function toGap(gap: { start: Date; last: Date; hours: number; reason: GapReason }): Gap {
  return {
    id: formatUtc(gap.start),
    from: localDateTimeWithOffset(gap.start),
    to: localDateTimeWithOffset(gap.last),
    hours: gap.hours,
    reason: gap.reason,
  };
}
