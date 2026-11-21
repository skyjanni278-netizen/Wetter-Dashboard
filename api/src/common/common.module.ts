import { Module } from '@nestjs/common';
import { Clock } from './clock';
import { clockFromEnv } from './fake-now';

/**
 * Gemeinsame Bausteine (03 B4.1). Per DI bereitgestellt wird nur die Uhr: `SystemClock`, oder
 * `FixedClock(FAKE_NOW)`, wenn `FAKE_NOW` gesetzt und der Scheduler aus ist (03 B4.8, `fake-now.ts`;
 * Tests ersetzen sie per `overrideProvider(Clock)`). BerlinTime, `formatUtc`, `round1`, Fehlerklassen,
 * Pipes und Middleware sind reine Funktionen bzw. Klassen, die mit `new` entstehen, und brauchen kein
 * Modul. Den globalen `ApiExceptionFilter` registriert `AppModule` als `APP_FILTER`.
 */
@Module({
  providers: [{ provide: Clock, useFactory: () => clockFromEnv() }],
  exports: [Clock],
})
export class CommonModule {}
