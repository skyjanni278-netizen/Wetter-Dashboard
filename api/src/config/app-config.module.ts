import { ConfigModule } from '@nestjs/config';
import type { DynamicModule } from '@nestjs/common';
import { envSourceOptions } from './config';
import { validateEnv } from './env.schema';

/**
 * Konfiguration der App (03 B4.8): `ConfigModule.forRoot({ isGlobal: true, validate })` mit `EnvSchema`
 * (`validateEnv`). `forRoot` liest `.env` und prüft **beim Laden dieser Datei** (also beim Import von
 * `app.module.ts`); bei einem Fehler ist das Promise abgelehnt. `main.ts` wartet zuerst darauf und bricht
 * dann mit der Meldung ab (fail fast, Exit-Code 1). Der leere `catch` verhindert nur, dass Node den Fehler
 * vorher als „unhandled rejection“ meldet; Nest und `main.ts` sehen ihn weiterhin.
 *
 * Hinweis: `ConfigModule` schreibt die geprüften Werte (mit Standardwerten) für alle Schlüssel, die noch nicht in
 * der Umgebung stehen, nach `process.env` (Verhalten von `@nestjs/config`). Gelesen werden sie im Code nur über
 * den `ConfigService`; `SchedulerModule` nutzt über `ConditionalModule` den so gesetzten Wert.
 *
 * Tests ersetzen einzelne Werte per `overrideProvider(ConfigService)` (`test/support/config.ts`).
 */
export const AppConfigModule: Promise<DynamicModule> = ConfigModule.forRoot({
  isGlobal: true,
  ...envSourceOptions(),
  validate: env => validateEnv(env),
  // `get` liefert nur geprüfte Werte, nie einen ungeprüften Rest aus `process.env`.
  skipProcessEnv: true,
});
AppConfigModule.catch(() => undefined);
