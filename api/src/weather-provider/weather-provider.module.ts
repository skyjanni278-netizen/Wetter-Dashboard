import { Module } from '@nestjs/common';
import { OpenMeteoClient } from './open-meteo.client';

/**
 * Open-Meteo-Client ohne DB-Abhängigkeit (03 B4.1, S7: ein Variablen-Mapping). Die optionalen Tokens
 * `OPEN_METEO_FETCH` und `OPEN_METEO_RETRY_DELAYS_MS` stellt hier niemand bereit; Tests ersetzen den
 * Client per `overrideProvider(OpenMeteoClient)` oder bauen ihn direkt.
 */
@Module({
  providers: [OpenMeteoClient],
  exports: [OpenMeteoClient],
})
export class WeatherProviderModule {}
