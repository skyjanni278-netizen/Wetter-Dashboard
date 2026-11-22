import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { ForecastsModule } from './forecasts/forecasts.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { LocationsModule } from './locations/locations.module';
import { ObservationsModule } from './observations/observations.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { StatsModule } from './stats/stats.module';
import { StatusModule } from './status/status.module';
import { WeatherProviderModule } from './weather-provider/weather-provider.module';

/**
 * Schritt 6: Module je Ressource nach 03 B4.1, ohne Zyklen und ohne `forwardRef`. Jedes Modul nutzt von
 * anderen nur, was diese über `exports` freigeben. `AppModule` bündelt die Module und registriert den
 * globalen `ApiExceptionFilter` (Fehlerformat B3.3); Middleware und Body-Parser richtet `configureApp`
 * ein (`app.setup.ts`).
 * Schritt 9: `DatabaseModule` (SQLite über TypeORM, `DB_PATH`); `HealthModule` für `GET /api/health`.
 * Schritt 10: `AuthModule` (Login, JWT; importiert `UsersModule`) registriert die globalen Guards.
 * Schritt 11: `AppConfigModule` (`ConfigModule.forRoot`, global, `EnvSchema`) steht zuerst; alle Module lesen
 * ihre Werte über den `ConfigService`. `SCHEDULER_ENABLED` wertet `SchedulerModule.forRoot()` nach dem Laden der
 * Konfiguration aus. Guards: Throttler → JWT → Rollen (ohne `@Public()`/`@Roles()` → 403).
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CommonModule,
    AuthModule,
    LocationsModule,
    ObservationsModule,
    ForecastsModule,
    WeatherProviderModule,
    ImportsModule,
    SchedulerModule.forRoot(),
    StatsModule,
    StatusModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
