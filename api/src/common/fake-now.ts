import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { isIsoDate } from './berlin-time';
import { Clock, FixedClock, SystemClock } from './clock';

/** Zeitpunkt in UTC mit `Z`, z. B. `2026-11-19T13:30:00Z` (wie `z.iso.datetime()` in 03 B4.8). */
const FakeNowSchema = z.iso.datetime();

/** Ungültige Kombination oder ungültiger Wert von `FAKE_NOW`; der Prozess startet dann nicht (fail fast). */
export class FakeNowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FakeNowConfigError';
  }
}

/**
 * 03 B4.8 (übergangsweise direkt aus `process.env`, Schritt 11: `EnvSchema`): `FAKE_NOW` setzt die Uhr
 * für Prüfungen im Browser fest. Erlaubt nur, wenn `SCHEDULER_ENABLED` nicht exakt `"true"` ist, damit
 * kein Import unter einer falschen Zeit speichert. Leer oder nicht gesetzt → `null` (echte Uhr).
 */
export function fakeNowFromEnv(env: NodeJS.ProcessEnv = process.env): Date | null {
  const raw = env['FAKE_NOW']?.trim();
  if (!raw) return null;
  if (!FakeNowSchema.safeParse(raw).success || !isIsoDate(raw.slice(0, 10))) {
    throw new FakeNowConfigError(
      `FAKE_NOW="${raw}" ist kein gültiger Zeitpunkt. Erwartet wird ein UTC-Zeitpunkt mit „Z“, z. B. 2026-11-19T13:30:00Z.`,
    );
  }
  if (env['SCHEDULER_ENABLED'] === 'true') {
    throw new FakeNowConfigError(
      'FAKE_NOW ist nur mit SCHEDULER_ENABLED=false erlaubt (sonst speichert der Scheduler unter einer falschen Zeit).',
    );
  }
  return new Date(raw);
}

/** Provider-Fabrik für `Clock`: `FixedClock(FAKE_NOW)` oder `SystemClock`. Wirft `FakeNowConfigError`. */
export function clockFromEnv(env: NodeJS.ProcessEnv = process.env): Clock {
  const fakeNow = fakeNowFromEnv(env);
  if (fakeNow === null) return new SystemClock();
  new Logger('Clock').warn(
    `Uhr steht fest auf FAKE_NOW=${env['FAKE_NOW']?.trim()} (FixedClock, nur für Prüfungen; Scheduler aus)`,
  );
  return new FixedClock(fakeNow);
}
