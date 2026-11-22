import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config';
import { OPEN_METEO_CONFIG, OpenMeteoClient } from './open-meteo.client';
import type { OpenMeteoConfig } from './open-meteo.client';

/**
 * Open-Meteo-Client ohne DB-Abhängigkeit (03 B4.1, S7: ein Variablen-Mapping). Adressen und Zeitlimit kommen aus
 * der Konfiguration (`OPEN_METEO_FORECAST_URL`, `OPEN_METEO_ARCHIVE_URL`, `OPEN_METEO_TIMEOUT_MS`, 03 B4.8). Die
 * optionalen Tokens `OPEN_METEO_FETCH` und `OPEN_METEO_RETRY_DELAYS_MS` stellt hier niemand bereit; Tests
 * ersetzen den Client per `overrideProvider(OpenMeteoClient)` oder bauen ihn direkt.
 */
@Module({
  providers: [
    {
      provide: OPEN_METEO_CONFIG,
      inject: [ConfigService],
      useFactory: (config: AppConfig): OpenMeteoConfig => ({
        forecastUrl: config.get('OPEN_METEO_FORECAST_URL', { infer: true }),
        archiveUrl: config.get('OPEN_METEO_ARCHIVE_URL', { infer: true }),
        timeoutMs: config.get('OPEN_METEO_TIMEOUT_MS', { infer: true }),
      }),
    },
    OpenMeteoClient,
  ],
  exports: [OpenMeteoClient],
})
export class WeatherProviderModule {}
