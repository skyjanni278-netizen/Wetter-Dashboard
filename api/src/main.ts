import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { AppConfigModule } from './config/app-config.module';
import type { AppConfig } from './config/config';
import { DB_PATH } from './database/db-path';

const logger = new Logger('Bootstrap');

/** Fehler beim Start: eine Zeile ohne Stacktrace (die Meldungen nennen Felder, nie Werte), Exit-Code 1. */
function abort(error: unknown): void {
  logger.error(`Start abgebrochen: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function bootstrap(): Promise<void> {
  // Fail fast (03 B4.8): `ConfigModule.forRoot` hat `.env` und Umgebung beim Laden von `app.module.ts` schon mit
  // `EnvSchema` geprüft. Ist das Ergebnis ein Fehler, hier abbrechen, bevor Nest etwas aufbaut (Nest würde sonst
  // mit `process.abort()` und Stacktrace enden). Die Meldung nennt das Feld, z. B. `JWT_SECRET ist zu kurz …`.
  try {
    await AppConfigModule;
  } catch (error) {
    abort(error);
    return;
  }

  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS));
  const config = app.get<AppConfig>(ConfigService);
  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });
  await app.listen(port, host);

  logger.log(`API läuft auf http://${host}:${port}/api (Datenbank: ${app.get<string>(DB_PATH)})`);
}

bootstrap().catch(abort);
