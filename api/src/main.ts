import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { fakeNowFromEnv } from './common/fake-now';
import { fixtureFromEnv } from './fixtures/fixture';
import { resolveLegacyDataDir } from './legacy/legacy-data-dir';

/** Nur lokal erreichbar (S9); Port übergangsweise aus `PORT` (Schritt 11: ConfigModule). */
const HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Fail fast (03 B4.8): `FAKE_NOW` und `FIXTURE` vor dem Aufbau prüfen, damit der Start mit einer klaren
  // Meldung abbricht (Nest würde einen Fehler in einer Provider-Fabrik nur mit `process.abort()` beenden).
  let fixtureName: string | null;
  try {
    fakeNowFromEnv(process.env);
    fixtureName = fixtureFromEnv(process.env)?.name ?? null;
  } catch (error) {
    logger.error(`Start abgebrochen: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS));

  const configured = Number.parseInt(process.env['PORT'] ?? '', 10);
  const port = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PORT;
  await app.listen(port, HOST);

  const source = fixtureName ? `Fixture: ${fixtureName}` : `Altdaten: ${resolveLegacyDataDir()}`;
  logger.log(`API läuft auf http://${HOST}:${port}/api (${source})`);
}

void bootstrap();
