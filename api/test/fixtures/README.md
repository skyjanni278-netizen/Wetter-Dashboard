# Fixtures (feste Testdaten)

Seit Roadmap-Schritt 9 liest die App nur noch die Datenbank. Eine Fixture kommt mit `npm run db:seed -- --fixture <name>` in die **Dev-DB** (`%LOCALAPPDATA%\wetter-heubach\weather.dev.db` bzw. `DB_PATH`); der Seed ersetzt dabei alle Stundenwerte, Importe und Vorhersagen (der Standort bleibt). Zusammen mit `FAKE_NOW` (feste Uhr, nur bei `SCHEDULER_ENABLED` ≠ `true`) lassen sich die Akzeptanzkriterien mit fester Uhrzeit in der laufenden App prüfen. `FIXTURE=<name>` beim Start gibt es nicht mehr (Abbruch mit Hinweis).

```bash
cd api && npm run db:seed -- --fixture us16-ok
FAKE_NOW=2026-11-19T13:30:00Z node dist/main.js
curl -s http://127.0.0.1:3001/api/days/today
```

Abweichung beim Seed: Importe mit `kind` `legacy`/`scheduled` werden als `range` angelegt. Diese Arten kennzeichnen gesammelte Daten, und der nächste `db:seed`/`db:reset` würde sich sonst verweigern; für `updateState` (R25) zählt `range` gleich. Fixtures ohne Import (`us06-records`, `us02-dst`) bekommen einen Import `range` mit `finishedAt` = `fakeNow`, weil jede Stunde einen Import braucht (`observation.import_id`).

Die e2e-Tests laden die Dateien mit `loadFixture(<name>)` und schreiben sie mit `seedApp` (`test/support/seed.ts`, also `applySeed` wie `db:seed`) in ihre `:memory:`-Datenbank (seit Schritt 9b).

## Format

Geprüft beim Start mit `FixtureSchema` (Zod, `.strict()`, `api/src/fixtures/fixture.ts`); ein Fehler bricht den Start mit Meldung ab.

| Feld | Inhalt |
|---|---|
| `name` | gleich dem Dateinamen |
| `description` | Zweck, Bezug zu den Stories |
| `fakeNow` | empfohlener Wert für `FAKE_NOW` (nur Hinweis, setzt die Uhr nicht) |
| `observations[]` | Stunden mit `timeUtc` (volle UTC-Stunde), den sechs Werten (`number` oder `null`) und `source` (`archive`, `forecast_api`, `prediction`). Der Berliner Tag und die Ortszeit ergeben sich über BerlinTime |
| `imports[]` | abgeschlossene Importe (`kind`, `status`, `from`, `to`, `requestedAt`, `startedAt`, `finishedAt`); IDs ab 1 in dieser Reihenfolge |
| `forecast` | Tagesvorhersage `{ fetchedAt, days[] }` oder `null` |

Die Dateien erzeugt ein einmaliges Skript; Änderungen von Hand sind erlaubt, solange das Schema gilt (`npx jest src/fixtures`).

## Inhalt

Alle Fixtures sind für `FAKE_NOW=2026-11-19T13:30:00Z` (14:30 MEZ, wie 03 B1.2) gedacht.

| Fixture | Stunden | Inhalt | Prüft |
|---|---|---|---|
| `us16-ok` | 240 | 10.–18.11.2026 vollständig (`forecast_api`), 19.11. 00–14 Uhr vergangen (`forecast_api`), 15–23 Uhr `prediction`. Stunde 14:00: 9,6 °C, gefühlt 5,1 °C, 0,4 mm, Code 61, Wind 21,3 km/h aus 232°. Niederschlag bis jetzt 0,4 mm, Vorhersage 9 × 0,6 = 5,4 mm. Import `scheduled` 18.–19.11., fertig 13:05:12Z. Vorhersage 19.–25.11. ohne Frost, `fetchedAt` 13:05:12Z | US01-3, US01-6 (`current` = 14:00), US16-1/-4 (`updateState = "ok"`, „+5,4 mm erwartet“) |
| `us16-delayed` | 240 | wie `us16-ok`, aber der letzte Import endete 10:05:12Z (11:05 MEZ): heute nur 00–11 Uhr vergangen, 12–23 Uhr `prediction` (12–14 Uhr damit veraltete Vorhersage), Vorhersage `fetchedAt` 10:05:12Z | US16-2/-5 (`updateState = "delayed"`, `current` = 11:00) |
| `us20-frost` | 240 | Stunden und Import wie `us16-ok`; Vorhersage mit Frost am 21.11. (`minTemp = -2.3`, `maxTemp = 2.4`), sonst keine Schwelle aus R30 erreicht | US20-1/-6 (Hinweise kommen in Schritt 12; hier nur die Daten) |
| `us06-records` | 288 | 29./30.06.2026 nass; 01.–03.07. trocken; **04.07. fehlt**; 05.–08.07. trocken; 09.07. 12,3 mm; 10.07. 1,5 mm. Stunde A 02.07. 15:00 = 30,04 °C, Stunde B 06.07. 16:00 = 30,03 °C. Heute 19.11.: 00–14 Uhr vergangen (Minimum 3,2 °C um 06:00), ab 15:00 `prediction` mit 35 °C (16:00), 50 mm (17:00) und −5 °C (23:00). Keine Importe, keine Vorhersage | US06-2 (`hottest.value = 30.0`, Datum von A), US06-3 (`longestDryPeriod.days = 4`, 05.–08.07.), US06-4 (Vorhersage ignoriert: `coldest` = 3,2 °C, `wettestDay` = 12,3 mm), `daysCounted = 11` |
| `us02-dst` | 48 | 29.03.2026 mit 23 Stunden (ohne 02:00) und 25.10.2026 mit 25 Stunden (02:00 doppelt), beide vollständig (`archive`) | US02-6/-7 (`hoursExpected = 23`/`25`) |
