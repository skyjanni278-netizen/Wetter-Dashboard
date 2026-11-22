/**
 * Läuft vor jeder Testdatei (Jest `setupFiles`, Unit und e2e), also vor dem Laden von `app.module.ts` und damit vor
 * `ConfigModule.forRoot` (03 B4.8). Tests berühren nie eine echte Datenbank und lesen nie `api/.env`:
 * - `NODE_ENV=test`: `ConfigModule` und `loadEnv` ignorieren dann die `.env` (`config/config.ts`), auch wenn sie
 *   auf die Sammel-DB zeigt. Nur die Werte hier und die übrigen Standardwerte aus `EnvSchema` gelten.
 * - `DB_PATH` ist immer `:memory:` (03 B4.4). Dort laufen die Migrationen beim Verbinden (`database-options.ts`).
 *   Ein Test mit Datei-DB setzt den Pfad per `overrideProvider(DB_PATH)` auf eine Datei im Temp-Ordner.
 * - festes `JWT_SECRET` nur für Tests (Pflicht, mindestens 32 Zeichen) und Standardlaufzeit.
 * - `SCHEDULER_ENABLED=false` (Standard wäre `true`): kein Cron-Job in Tests; wer den Scheduler braucht, ersetzt
 *   das Token `SCHEDULER_ENABLED` bzw. nutzt `SchedulerModule.forRoot(true)`.
 * - `THROTTLE_GLOBAL_LIMIT` hoch: Alle Anfragen einer Testdatei kommen von derselben IP (supertest, 127.0.0.1) an
 *   **eine** App; der Charakterisierungstest allein schickt Hunderte. Mit dem Standard 120 liefen Tests je nach
 *   Reihenfolge zufällig auf 429. Das globale Limit selbst prüft `access.e2e-spec.ts` mit dem Standard 120
 *   (`testConfig({ THROTTLE_GLOBAL_LIMIT: undefined })`). Das Login-Limit (5) ist fest und gilt weiter.
 * - Werte aus der Shell, die Tests verändern würden, werden entfernt (Passwörter, feste Uhr, CORS, Swagger …).
 */
process.env['NODE_ENV'] = 'test';
process.env['DB_PATH'] = ':memory:';
process.env['JWT_SECRET'] = 'test-secret-nur-fuer-jest-mindestens-32-zeichen';
process.env['SCHEDULER_ENABLED'] = 'false';
process.env['THROTTLE_GLOBAL_LIMIT'] = '1000000';
for (const key of [
  'HOST',
  'PORT',
  'JWT_EXPIRES_IN',
  'TRUST_PROXY',
  'CORS_ORIGINS',
  'SWAGGER_ENABLED',
  'OPEN_METEO_FORECAST_URL',
  'OPEN_METEO_ARCHIVE_URL',
  'OPEN_METEO_TIMEOUT_MS',
  'FAKE_NOW',
  'FIXTURE',
  'DEV_ADMIN_PASSWORD',
  'ADMIN_INITIAL_PASSWORD',
]) {
  delete process.env[key];
}
