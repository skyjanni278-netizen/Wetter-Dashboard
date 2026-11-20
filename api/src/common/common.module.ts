import { Module } from '@nestjs/common';
import { Clock, SystemClock } from './clock';

/**
 * Gemeinsame Bausteine (03 B4.1). Per DI bereitgestellt wird nur die Uhr (`Clock` = `SystemClock`,
 * Tests ersetzen sie per `overrideProvider(Clock)`). BerlinTime, `formatUtc`, Fehlerklassen, Pipes
 * und Middleware sind reine Funktionen bzw. Klassen, die mit `new` entstehen, und brauchen kein Modul.
 * Den globalen `ApiExceptionFilter` registriert `AppModule` als `APP_FILTER`.
 */
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class CommonModule {}
