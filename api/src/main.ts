import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { fakeNowFromEnv } from './common/fake-now';
import { DB_PATH } from './database/db-path';

/** Nur lokal erreichbar (S9); Port übergangsweise aus `PORT` (Schritt 11: ConfigModule). */
const HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

/**
 * `FIXTURE` gibt es seit Schritt 9 nicht mehr: Die App liest nur noch die Datenbank. Statt still auf der
 * Dev-DB zu starten, bricht der Start mit dem neuen Weg ab.
 */
function assertNoFixtureEnv(env: NodeJS.ProcessEnv): void {
  const name = env['FIXTURE']?.trim();
  if (name) {
    throw new Error(
      `FIXTURE="${name}" wird nicht mehr unterstützt. Fixture in die Dev-DB laden: npm run db:seed -- --fixture ${name}`,
    );
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Fail fast (03 B4.8): Umgebung vor dem Aufbau prüfen, damit der Start mit einer klaren Meldung abbricht
  // (Nest würde einen Fehler in einer Provider-Fabrik nur mit `process.abort()` beenden).
  try {
    fakeNowFromEnv(process.env);
    assertNoFixtureEnv(process.env);
  } catch (error) {
    logger.error(`Start abgebrochen: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS));

  const configured = Number.parseInt(process.env['PORT'] ?? '', 10);
  const port = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PORT;
  await app.listen(port, HOST);

  logger.log(`API läuft auf http://${HOST}:${port}/api (Datenbank: ${app.get<string>(DB_PATH)})`);
}

void bootstrap();
