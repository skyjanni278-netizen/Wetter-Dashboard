import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config';
import { Clock } from './clock';
import { clockFor } from './fake-now';

/**
 * Gemeinsame Bausteine (03 B4.1). Per DI bereitgestellt wird nur die Uhr: `SystemClock`, oder
 * `FixedClock(FAKE_NOW)`, wenn `FAKE_NOW` gesetzt ist (03 B4.8, aus dem globalen `ConfigModule`; `EnvSchema`
 * erlaubt es nur mit Scheduler aus und nicht in Produktion. Tests ersetzen die Uhr per `overrideProvider(Clock)`).
 * BerlinTime, `formatUtc`, `round1`, Fehlerklassen, Pipes und Middleware sind reine Funktionen bzw. Klassen,
 * die mit `new` entstehen, und brauchen kein Modul. Den globalen `ApiExceptionFilter` registriert `AppModule`.
 */
@Module({
  providers: [
    {
      provide: Clock,
      inject: [ConfigService],
      useFactory: (config: AppConfig) => clockFor(config.get('FAKE_NOW', { infer: true })),
    },
  ],
  exports: [Clock],
})
export class CommonModule {}
