import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { resolveLegacyDataDir } from './legacy/legacy-data-dir';

/** Nur lokal erreichbar (S9); Port übergangsweise aus `PORT` (Schritt 11: ConfigModule). */
const HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS));

  const configured = Number.parseInt(process.env['PORT'] ?? '', 10);
  const port = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PORT;
  await app.listen(port, HOST);

  const logger = new Logger('Bootstrap');
  logger.log(`API läuft auf http://${HOST}:${port}/api (Altdaten: ${resolveLegacyDataDir()})`);
}

void bootstrap();
