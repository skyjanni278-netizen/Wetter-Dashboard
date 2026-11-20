import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

/**
 * Stammdaten Standort (03 B4.1, unten im Graphen, importiert kein Fachmodul). Bis Schritt 9 ist Heubach
 * eine Konstante (`HEUBACH`), die andere Module als TypeScript-Wert nutzen; per DI braucht noch niemand
 * den `LocationsService`, exportiert ist er trotzdem für spätere Module.
 */
@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
