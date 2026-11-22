/**
 * DI-Token: Wert `true`, wenn der stündliche Abruf laufen soll (`SchedulerModule.forRoot`). Der Wert kommt aus
 * `SCHEDULER_ENABLED` (`EnvSchema`, 03 B4.8: nur `true`/`false`, Standard `true`); Tests ersetzen das Token.
 */
export const SCHEDULER_ENABLED = 'SCHEDULER_ENABLED';
