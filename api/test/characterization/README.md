# Charakterisierung der Alt-API (Golden Files)

Die Dateien in `golden/` halten die Antworten der Express-API fest, wie sie am 19.11.2026 waren. Sie wurden auf Roadmap-Schritt 0.1 aufgenommen. Beim Altdatenimport (03-zielbild.md B2.7, Roadmap Schritt 9) dienen sie als Vergleichsstand für die neue NestJS-API.

## Neu aufnehmen

```bash
# Express läuft auf :3000 (cd backend && npm run dev)
bash api/test/characterization/capture.sh
# andere Adresse:
BASE=http://localhost:3001 bash api/test/characterization/capture.sh
```

Das Skript überschreibt `golden/`. Für einen Vergleich kopierst du es vorher an einen anderen Ort und führst es dort aus.

## Bekannte Abweichungen beim Vergleich

- **Teiltag 19.11.2026:** `month-2026-11.json`, `year-2026.json` und `stats.json` (`totalDays` und eventuell die Rekorde) enthalten den laufenden Tag 19.11.2026, Stand etwa 18:28 Uhr. Dessen Stunden ab 19:00 sind Vorhersagewerte. Ein späterer Lauf liefert hier andere Werte. Diese Unterschiede kommen aus den Daten, nicht aus dem Code. Beim Vergleich ist der 19.11.2026 auszunehmen.
- **Bekannte Fehler bleiben enthalten:** Die Golden Files zeigen das Ist-Verhalten, auch die Fehler F13 (Vorhersage in Summen), F14 (Rundung bei Rekorden), F27 (Trockenperiode über Lücken) und F28 (ungewichtetes Jahresmittel). Weicht die neue API in diesen Punkten ab, ist das gewollt. Jede solche Abweichung wird im Vergleich mit ihrer F-Nummer begründet.

## Automatischer Vergleich (Roadmap-Schritt 7)

`characterization.e2e-spec.ts` startet die Nest-App im Test (supertest, ohne Express, ohne Port) mit `FixedClock` 2026-11-20T12:00:00Z auf SQLite `:memory:`. Seit Schritt 9b kommt der Altbestand per Altdatenimport in die Datenbank (`LegacyImporter`, derselbe Code wie `npm run cli -- import:legacy`, Regel `fixed+01:00`): Importiert wird eine Kopie der Tagesdateien aus `backend/data` bis zum Datum der Uhr (20.11.2026) **mit** ihren Änderungszeiten (`copyLegacySubset`, `preserveTimestamps`); spätere Dateien (21.11.) bleiben draußen, `backend/data` wird nur gelesen. Vergleich mit Toleranz 0,05. Läuft mit den e2e-Tests (`npm run test:e2e`); fehlt `backend/data` (nicht im Git), wird er übersprungen. Dauer etwa 20 s.

Die Golden Files haben eine andere Struktur als die neue API. Abbildung:

| Golden File (Express) | Neue API | Schlüssel im Vergleich |
|---|---|---|
| `day-<datum>.json`: `hourly[].time` und die sechs Werte (`weathercode`, `windspeed`, `winddirection`) | dieselbe UTC-Stunde: `time` nach Regel `fixed+01:00` in UTC (`legacyTimeToUtc`), daraus Berliner Tag und Stunde; `GET /api/days/<Berliner Tag>`: `hours[<Stunden seit 00:00 Berlin>]` mit passendem `timeLocal` (im Sommer eine Stunde später, 23:00 am Folgetag), Felder `weatherCode`, `windSpeed`, `windDirection`; Anzahl der Stunden von `GET /api/days/<datum>` | `day:<datum>:<HH:MM>:<feld>`, `day:<datum>:hours` |
| `month-<jm>.json`: `data[].avgTemp`, `data[].totalPrecip` je Tag | `GET /api/days/<datum>`: `observed.temperature.mean`, `observed.precipitationSum` (eine Liste je Monat gibt es erst mit `/api/days?from&to`, Schritt 8) | `month:<jm>:<datum>:avgTemp\|totalPrecip` |
| `month-<jm>.json`: Zahl der Einträge in `data` | `GET /api/summaries/months/<jm>`: `daysComplete` | `month:<jm>:days` |
| `year-<j>.json`: `data[].avgTemp`, `data[].totalPrecip` je Monat (stundengewichtet) | `GET /api/summaries/months/<jm>`: `temperature.mean` (Mittel der Tagesmittel), `precipitationSum` | `year:<j>:<jm>:avgTemp\|totalPrecip` |
| `year-<j>.json`: Mittel der Monatsmittel und Summe der Monatssummen (so rechnet `yearly-page.ts`); Zahl der Monate | `GET /api/summaries/years/<j>`: `temperature.mean`, `precipitationSum`, `monthsWithData` | `year:<j>:mean`, `year:<j>:precipitationSum`, `year:<j>:monthsWithData` |
| `stats.json`: `hottestDay`, `coldestDay`, `rainiestDay`, `driestStreak`, `totalDays` | `GET /api/records`: `hottest`, `coldest` (Stundenwerte), `wettestDay`, `longestDryPeriod`, `daysCounted` | `stats:…` |

Zusätzlich prüft der Test US05-1 (`/api/summaries/years/2025`: `complete = true`, `meanMethod = "mean_of_daily_means"`).

**Liste „erwartet anders“:** `expected-differences.json`. Jede Abweichung muss dort über ein Muster (RegExp auf den Schlüssel) mit F-/R-Nummer und Begründung stehen, sonst schlägt der Test fehl. Ein Eintrag, der nicht mehr auftritt, lässt den Test ebenfalls fehlschlagen (Liste veraltet), außer er ist mit `mayBeAbsent` als im Altbestand nicht vorkommend markiert. Stand (Schritt 9b): R11 (Rundung x,x5 an sechs Tagen außerhalb der Sommerzeit), F13/Z3 (Teiltag 19.11.2026), F13/R13 (November 2026, Jahressumme 2026, `totalDays`), F28/R12 (Jahresmittel 2026), **Z1** (Regel `fixed+01:00`: Stundenzahl der drei DST-Tage, Tagesmittel an 275 und Tagessummen an 81 genau aufgezählten Sommertagen, vier Monatswerte an Monatsgrenzen); F14 und F27 treten im Altbestand nicht auf. Alle Stundenwerte der zehn Tage stimmen genau.

## Frontend-Tests auf der USB-Platte

`cd frontend && npm test -- --watch=false` lädt jsdom auf Laufwerk D: (USB, FAT32) in etwa 130 s. Der erste Lauf kann deshalb mit `Timeout waiting for worker to respond` abbrechen. Dann einfach erneut ausführen: Ab dem zweiten Lauf sind die Dateien im Cache und der Test läuft durch.
