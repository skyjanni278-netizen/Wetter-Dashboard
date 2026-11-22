import { ConfigModule } from '@nestjs/config';
import type { ConfigModuleOptions, ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import { parseEnv } from './env.schema';
import type { Env } from './env.schema';

/** Typisierter Zugriff: `config.get('PORT', { infer: true })` liefert `number`. */
export type AppConfig = ConfigService<Env, true>;

/**
 * Woher die Werte kommen (App und CLI gleich): `.env` im **Arbeitsverzeichnis** (für `npm start`/`npm run …`
 * also `api/.env`), darüber die Umgebungsvariablen des Prozesses (sie haben Vorrang, so überschreibt z. B.
 * `PORT=3002 npm start` die Datei). Mit `NODE_ENV=test` in der Umgebung (Jest setzt das, `test-env.ts`
 * erzwingt es) wird **keine** `.env` gelesen, damit eine lokale `.env` (z. B. mit der Sammel-DB) keinen Test
 * beeinflusst.
 */
export function envSourceOptions(env: NodeJS.ProcessEnv = process.env): Pick<ConfigModuleOptions, 'ignoreEnvFile'> {
  return { ignoreEnvFile: env['NODE_ENV'] === 'test' };
}

/**
 * Für die CLI (ohne Nest-Anwendung): dieselbe Lade-Logik wie `ConfigModule.forRoot` der App (gleicher
 * `.env`-Parser, gleicher Vorrang), aber mit einem **Teilschema** (`env.schema.ts`), damit z. B.
 * `migration:run` kein `JWT_SECRET` verlangt. Wirft `EnvConfigError` mit den Feldnamen.
 */
export async function loadEnv<S extends z.ZodType>(schema: S): Promise<z.output<S>> {
  let env: z.output<S> | undefined;
  await ConfigModule.forRoot({
    ...envSourceOptions(),
    validate: raw => {
      env = parseEnv(schema, raw);
      return env as Record<string, unknown>;
    },
  });
  return env as z.output<S>;
}
