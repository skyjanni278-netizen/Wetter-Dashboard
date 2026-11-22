import { ConfigService } from '@nestjs/config';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { validateEnv } from '../../src/config/env.schema';
import type { Env } from '../../src/config/env.schema';

/**
 * `ConfigService` für e2e-Tests mit einzelnen anderen Werten (03 B4.8): die Test-Umgebung aus `test-env.ts`,
 * darüber `overrides` (Text wie in `.env`; `undefined` entfernt den Wert, dann gilt der Standard aus `EnvSchema`),
 * geprüft wie beim Start. Wie in der App liefert `get` nur geprüfte Werte (`skipProcessEnv`).
 *
 *   Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService).useValue(testConfig({ SWAGGER_ENABLED: 'true' }))
 */
export function testConfig(overrides: Record<string, string | undefined> = {}): ConfigService<Env, true> {
  const raw: Record<string, string | undefined> = { ...process.env, ...overrides };
  for (const [key, value] of Object.entries(raw)) if (value === undefined) delete raw[key];
  const service = new ConfigService<Env, true>(validateEnv(raw));
  (service as unknown as { skipProcessEnv: boolean }).skipProcessEnv = true;
  return service;
}

/** Kurzform: `withConfig(Test.createTestingModule(…), { … })`. */
export function withConfig(builder: TestingModuleBuilder, overrides: Record<string, string | undefined>): TestingModuleBuilder {
  return builder.overrideProvider(ConfigService).useValue(testConfig(overrides));
}
