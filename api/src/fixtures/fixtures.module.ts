import { Logger, Module } from '@nestjs/common';
import { ACTIVE_FIXTURE, fixtureFromEnv } from './fixture';

/**
 * Übergang bis Schritt 9: stellt die über `FIXTURE=<name>` gewählte Fixture bereit (Token `ACTIVE_FIXTURE`,
 * `null` ohne `FIXTURE`). Nur die In-Memory-Stores (Observations, Forecasts, Imports) nutzen sie; das Modul
 * kennt keine Fachmodule. Mit `db:seed --fixture` (Schritt 9) fällt es weg.
 */
@Module({
  providers: [
    {
      provide: ACTIVE_FIXTURE,
      useFactory: () => {
        const fixture = fixtureFromEnv();
        if (fixture) {
          new Logger('Fixture').warn(
            `Fixture "${fixture.name}" aktiv: ${fixture.observations.length} Stunden, ${fixture.imports.length} Import(e), ` +
              `Vorhersage ${fixture.forecast ? 'ja' : 'nein'}; der Altbestand wird nicht ausgewertet`,
          );
        }
        return fixture;
      },
    },
  ],
  exports: [ACTIVE_FIXTURE],
})
export class FixturesModule {}
