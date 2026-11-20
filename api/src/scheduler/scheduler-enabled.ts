/** DI-Token: Wert `true`, wenn der stündliche Abruf laufen soll (`SchedulerModule.forRoot`). */
export const SCHEDULER_ENABLED = 'SCHEDULER_ENABLED';

/**
 * Schalter `SCHEDULER_ENABLED` übergangsweise aus `process.env` (wie `PORT`, Schritt 11: ConfigModule).
 * Standard `false`, weil im Parallelbetrieb Express schreibt; nur der exakte Text `"true"` schaltet ein.
 */
export function isSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SCHEDULER_ENABLED'] === 'true';
}
