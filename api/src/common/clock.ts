/**
 * Zeitquelle der Anwendung (C6). Code, der „jetzt“ braucht, fragt die Clock statt `new Date()`.
 * So lassen sich Tests mit fester Uhrzeit schreiben (z. B. 00:30 MEZ, Zeitumstellung).
 *
 * Abstrakte Klasse statt Interface, damit sie zugleich als DI-Token dient.
 */
export abstract class Clock {
  /** Aktueller Zeitpunkt als neues `Date`-Objekt (UTC-Instant). */
  abstract now(): Date;
}

/** Echte Systemzeit. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Feste Uhrzeit für Tests; mit `set` und `advance` verstellbar. */
export class FixedClock extends Clock {
  private instant: number;

  constructor(instant: Date | string) {
    super();
    this.instant = FixedClock.toMillis(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date | string): void {
    this.instant = FixedClock.toMillis(instant);
  }

  advance(milliseconds: number): void {
    this.instant += milliseconds;
  }

  private static toMillis(instant: Date | string): number {
    const millis = new Date(instant).getTime();
    if (Number.isNaN(millis)) {
      throw new RangeError(`Ungültiger Zeitpunkt: "${String(instant)}"`);
    }
    return millis;
  }
}
