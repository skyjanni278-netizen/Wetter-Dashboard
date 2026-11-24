# 05 – Prüfung der Pläne

> **Umsetzungsstand (24.11.2026):** Dieses Dokument bleibt die Prüfung der Pläne 01–04 vom 19.11.2026 und ist nicht umgeschrieben. Alle 37 Befunde (P01–P37) sind in 01–04 eingearbeitet (Zählung am Ende des Dokuments); die Umsetzung der geprüften Pläne steht im Status von `04-roadmap.md` (Schritte 0.1 bis 13 erledigt, Schritt 14 ohne Pi). Spätere, nach der Umsetzung gefundene Abweichungen stehen nicht hier, sondern in `03-zielbild.md` („Abweichungen in der Umsetzung“) und in den Befunden der Prüfer je Schritt (Status-Blöcke in `04-roadmap.md`).

Stand: 19.11.2026 · Geprüft: `01-analyse.md`, `02-verbesserungen-und-design.md`, `03-zielbild.md`, `04-roadmap.md` (alle vollständig gelesen). Kontraste selbst gerechnet nach WCAG 2.2 (relative Luminanz, `node -e`). Die Kontrollwerte stimmen: `#C2571A` auf `#F4F2EE` = 4,02 und `#E8772E` auf `#1B1F24` = 5,61. Code wurde nur gelesen (`frontend/src/styles.css`, `app.css`, `today-page.html`), um Aussagen der Pläne nachzuprüfen.

**Schwere:**
- **hoch:** Wer den Plan wörtlich umsetzt, bekommt falsche Daten, verliert Daten oder baut eine Sicherheitslücke ein.
- **mittel:** Der Plan widerspricht sich, eine angenommene Funktion fehlt, oder ein Schritt bzw. Kriterium lässt sich so nicht umsetzen oder prüfen.
- **niedrig:** Verweise, Beispiele, Zählungen und kleine Lücken, die beim Umsetzen stören, aber nichts kaputt machen.

**Fundstellen** stehen als Dokument und Abschnitt da, z. B. „03 B4.7“. Zeilennummern gelten für den geprüften Stand.

---

## Kurzfazit

Die Pläne sind gründlich und passen in den großen Linien zusammen: Jeder Fehler F01–F34 hat einen Roadmap-Schritt, jede Regel aus 01 1.2 einen Ort, und jedes Sicherheitsproblem aus 01 1.3 eine Gegenmaßnahme. Alle 43 Kontrastwerte in 02 E3.3 und die Werte in den Kommentaren von `tokens.css` stimmen; es gibt keine falsche Zahl. Zwei Punkte sind **hoch**: Die Seed- und Reset-Befehle sind nur durch `NODE_ENV=production` gesperrt, obwohl der Entwicklungsrechner laut Roadmap wochenlang die echten Daten sammelt. Außerdem bleibt der Cache nach Importen und Korrekturen veraltet, weil die SQL-Schreibbefehle `updated_at` nicht setzen. Die wichtigsten mittleren Befunde: Die Bedienelemente der bestehenden Seiten (Pfeile, Datumsfeld, Button „Heute“, Auswahlfelder) haben keine Akzeptanzkriterien in den Stories. N03 hat keine Übersicht der Korrekturen, die Rücknahme ist angenommen, aber nicht eingeplant, und die Pfade in 02 E2 sind noch nicht an 03 B3.1 angeglichen. Mehrere Browser-Kriterien setzen eine feste Uhrzeit voraus, die sich in der laufenden App gar nicht setzen lässt. Insgesamt gibt es **37 Befunde: 2 hoch, 11 mittel, 24 niedrig**.

---

## 1. Abdeckung der Funktionen (01 1.1) und von N01–N07 durch Stories

### 1.1 Bestehende Funktionen

| Seite | Funktion (01 1.1) | Story / AK in 03 | Roadmap-Prüfung | Ergebnis |
|---|---|---|---|---|
| Heute | Pfeile ‹ › | nur im Story-Text von US02 („über Pfeile …“), **kein AK** | 0.2 (5 × ‹), 0.4 (‹ → Zurück) | Lücke in 03 → **P05** |
| Heute | Datumsfeld | Story-Text US02, kein Browser-AK | 0.4 (leeren, `min`/`max`) | Lücke in 03 → **P05** |
| Heute | Button „Heute“ | **nirgends** (03 und 04 kennen nur „Zurück zu heute“ bei Zukunftsdaten, 04 0.4) | – | **fehlt** → **P05** |
| Heute | Zukunftsdaten gesperrt (› deaktiviert) | US02-4 nur API (400 `DATE_IN_FUTURE`) | 0.4 (`max` am Feld) | UI-Sperre von › ohne AK → **P05** |
| Heute | Hero: aktuelle Stunde, gefühlte Temperatur, Wind | Story-Text US01; AKs prüfen nur `date`, `isPrediction`, `observed`. `current` enthält laut B2.2 nur `observationId`/`timeLocal`. US16-4 prüft nur den Kicker | 7 (Hero-Kicker) | gefühlte Temperatur und Wind ohne AK → **P05** |
| Heute | vergangene Tage: Max, Min, Summe | US01-5, US02-1 | 1 (Kicker „HÖCHSTWERT“) | ✔ |
| Heute | 7-Tage-Vorschau | US03-1 bis -3 | 2, 0.3 (nur bei heute) | ✔ |
| Heute | Tagesdiagramm (Linie + Balken) | US16-4 (heute), US16-6 (vergangener Tag) | 1 (Textalternative) | ✔ |
| Monat | Auswahl Jahr und Monat | US04-8 (Jahresliste, API) | 0.2 (F02), 0.3 (F21) | Auswahl selbst ohne Story-AK → **P05** |
| Monat | Button „Laden“ | entfällt bewusst (F21, V15) | 0.3 | ✔ (begründet) |
| Monat | Kennzahlen | US04-1, US04-4 | 8 | ✔ |
| Monat | Diagramm aus Tagesmitteln | US04-2 (Daten), kein Browser-AK | 1 (V21 ohne Prüfung) | Lücke → **P05**, **P21** |
| Jahr | Auswahl Jahr | US04-8 | 0.3, 8 | ✔ |
| Jahr | Kennzahlen | US05-1, US05-3 | 8 (11,6 °C) | ✔ |
| Jahr | Diagramm aus Monatsmitteln | US05-2 (Daten) | – | Browser-AK fehlt → **P05** |
| Rekorde | heißester / kältester Tag (Stundenwert) | US06-1, -2, -4 | 7 | ✔ |
| Rekorde | regenreichster Tag | US06-1 | 7 | ✔ |
| Rekorde | längste Trockenperiode (< 0,1 mm) | US06-3, R09, R10 | 7 | ✔ |
| Rekorde | Gesamtzahl der Tage | US06-1 `daysCounted` | 7 | ✔ |
| (API) | `/api/status`, im Frontend ungenutzt | US07, US16, US17 | 2, 12a | ✔ |

### 1.2 Angenommene neue Funktionen N01–N07

| N | Story in 03 | Bemerkung | Ergebnis |
|---|---|---|---|
| N01 | US01-3, US07, US08-3, **US16** | ✔ vollständig (API und Browser) | ✔ |
| N02 | US09, US10, US11, US12 | ✔ | ✔ |
| N03 | US13-1 bis -12 | **Übersicht aller Korrekturen** („Änderungsprotokoll“, 02 N03 `GET /api/corrections?from&to`, Admin-Tabelle in 02 E3.7.5 und E3.9) fehlt; es gibt nur die Historie je Stunde | Lücke → **P06** |
| N03 | – | **Rücknahme** (02 N03 `DELETE /api/corrections/{id}`) ist mit N03 angenommen, in 03 aber offene Frage 3 und in 04 „nicht eingeplant“ | Widerspruch → **P07** |
| N03 | – | Risiko aus 02 N03 „Hinweis auf der Rekordseite“, wenn sich Rekorde durch Korrekturen ändern: keine Story | Lücke → **P36** |
| N04 | US14 (Admin), **US17** (Gast) | Route `/status` fehlt in 03 B5.1 | → **P29** |
| N05 | **US18** | ✔ | ✔ |
| N06 | **US19** | Browser-AK nur für das Jahr (`/jahr/2026`), nicht für den Monatsvergleich | → **P36** |
| N07 | **US20** | ✔ (als eigene Ressource `/api/notices`) | ✔ |

---

## 2. Fehler F01–F34 in der Roadmap

Ich habe die Abdeckungsmatrix (04, Abschnitt „Abdeckungsmatrix“) gegen die Zeilen „Bezug“, die Aufgaben und die Tabellen „Fertig, wenn …“ der Schritte geprüft.

| F | Matrix | in den Schritten selbst | Ergebnis |
|---|---|---|---|
| F01 | 0.1, 3, 9 | 0.1 Aufgabe „F01 prüfen“; 3 Unit-Test `partial`; 9 Bezug | ✔ |
| F02 | 0.2 | 0.2 Aufgabe V01 und Browser-Prüfung | ✔ |
| F03 | 0.2 | 0.2 Prüfung „nur die Fehlerbox“ | ✔ |
| F04 | 0.2 | 0.2 Prüfung 5 × ‹ | ✔ |
| F05 | 0.2, 1 | 0.2 und 1 `scrollWidth` | ✔ |
| F06 | 0.2, 7 | 0.2 `berlinToday()` und Express-Fix; 7 e2e 00:30 | ✔ |
| F07 | 0.2 | 0.2 Übergangsfokus `#C2571A`, gemessen auf dem **alten blauen Header nur 1,32–2,10:1** | **nicht behoben in 0.2** → **P10** |
| F08 | 1 | 1 axe | ✔ |
| F09 | 0.4 | 0.4 „Datumsfeld leeren“ | ✔ |
| F10 | 1, 9, 14 | 1 Skelett; 9 `autocannon`; 14 p95 Pi | ✔ |
| F11 | 0.4 | 0.4 `/monat/2025/03` + F5 | ✔ |
| F12 | 0.2 | 0.2 „simulierter 500“; die Prüfung ist unscharf | ✔ (Prüfung → **P21**) |
| F13 | 7, 12a | 7 `isPrediction`; 12a US16 | ✔ |
| F14 | 7 | 7 `hottest.value = 30.0` | ✔ |
| F15 | 0.3, 7 | 0.3 Unit-Test; 7 US01-5 | ✔ |
| F16 | 0.3, 9 | 0.3 README; 9 Skript gelöscht | ✔, aber neues Risiko durch `db:seed`/`db:reset` → **P01** |
| F17 | 1 | 1 Accessibility-Baum | ✔ |
| F18 | 0.3 | 0.3 Prüfung | ✔ |
| F19 | 0.4 | 0.4 `min`/`max` | ✔ |
| F20 | 0.3, 8 | 0.3 und 8 Jahresliste | ✔ |
| F21 | 0.3 | 0.3 „genau 1 Request“ | ✔ |
| F22 | 4 | 4 `2026-02-30`; Monat 13 erst in 8 (US04-3) | ✔ |
| F23–F25 | 1 | 1 `/tag/2026-11-10` | ✔ |
| F26 | 0.3 | 0.3 `describeWeather` | ✔ |
| F27 | 7 | 7 `longestDryPeriod.days = 4` | ✔ |
| F28 | 7, 8 | 7 `meanMethod`; 8 „nahe 11,6 °C“ | ✔ |
| F29, F30 | 0.3 | 0.3 Browser | ✔ |
| F31 | 0.2, 1 | 1 „mindestens 44 × 44 px“ | ✔ |
| F32 | 2, 9 | 2 `never`; 9 Neustart | ✔ |
| F33 | 0.1, 14 | 0.1 `npm test`; 14 alle grün | ✔ |
| F34 | 0.3 | 0.3 `grep keymetrics` | ✔ |

**Ergebnis:** Jeder Fehler hat einen Schritt. Nur bei F07 hält der genannte Schritt 0.2 nicht, was die Matrix verspricht (**P10**). Kleinere Unstimmigkeiten zwischen der US-Matrix und den Bezugszeilen stehen in **P35**.

---

## 3. Regeln aus 01 1.2 und ihr Ort (Zod, Service, DB)

| Regel / Befund in 01 1.2 | Ort laut 03 | Ergebnis |
|---|---|---|
| „Heute“ in UTC | R02, R06: Service (`Clock`, `BerlinTime`) plus DB (`local_date`) | ✔ |
| Aktuelle Stunde | R08: Service (`:now`); Feld `current` | ✔ |
| Vorhersagestunden in Summen und Rekorden | R08, R09, R11, R13: Service; DB `CHECK(source …)` | ✔ |
| Herkunft (Archiv / Forecast-API) | `source` mit DB-`CHECK`, B2.7 Schritt 6 | ✔ |
| Rekorde mit gerundetem Wert | R11: SQL/Service ungerundet, `round1()` nur im Mapper | ✔ |
| Trockenperiode über Dateien statt Tage | R10: Service | ✔ |
| Mittelwerte uneinheitlich | R12: Service | ✔ |
| `null`-Werte | R14: DB (nullable), Service, Zod `.nullable()` | ✔ |
| WMO-Codes | R15: Zod (`z.enum`, 28 Codes, nachgezählt) plus DB-`CHECK` | ✔ |
| Validierung nur per Regex | R01, R04, R05: Zod | ✔ |
| Zukunftssperre fehlt im Backend | R02: Service | ✔. Für `/days?from&to` ist aber unklar, ob `to` in der Zukunft liegen darf; die Monatsseite fragt den ganzen Monat ab → **P03** |
| Sommer- und Winterzeit | R07: Service plus DB (Unique-Index, `CHECK utc_offset_min`) | ✔ |
| **Datenintegrität:** nicht atomares Schreiben | Transaktionen (B2.7 Schritt 8, C1 A08) | ✔ |
| kaputte Dateien still übersprungen | `LegacyDaySchema` (Zod `.strict()`), US15-4 | ✔ |
| gültiges JSON ohne `hourly` → 500 | nur in C1 A08 („Zod-Prüfung jeder Open-Meteo-Antwort“); **keine Regel in B1.3, kein Test in der Roadmap** | teilweise → **P15** |
| `Promise.all` im Scheduler | US08-2: Service (`partial`) | ✔ |
| `seed-data.ts` überschreibt Echtdaten | V34 löschen; Seeds verweigern nur in Produktion | teilweise → **P01** |
| Backfill überschreibt alles | R20: Upsert nur bei Änderung und ohne Korrektur | ✔ |
| Cache und Datenrevision (folgt aus S1) | B2.4: Schlüssel `MAX(updated_at)` + `COUNT(*)` | Schreibbefehle setzen `updated_at` nicht → **P02** |
| Status geht beim Neustart verloren | Tabelle `import` | ✔ |
| Vorhersagestunden bleiben nach Tagesende stehen | N3 (03 Abschnitt 0), US08-3, Lückenart `stale_prediction` | ✔ |
| Auswahl in der UI geht verloren | Routen mit Parametern (V08) | ✔ |
| Stammdaten hart codiert | Tabelle `location` | ✔ |

---

## 4. Sicherheitsprobleme aus 01 1.3 und ihre Gegenmaßnahmen

| Problem (01 1.3) | Gegenmaßnahme 03 C / B | Roadmap-Schritt und Prüfung | Ergebnis |
|---|---|---|---|
| CORS `*` | B5.3 CORS aus, B4.8 `CORS_ORIGINS`, C1 A02 | 11: „kein `Access-Control-Allow-Origin`“ | ✔ für Nest; Express bleibt bis Schritt 9 offen → **P17** |
| Bindung an 0.0.0.0 | B4.8 `HOST=127.0.0.1`, B5.3 | 2 und 14: „Verbindung abgelehnt“ | ✔ für Nest; Express bis Schritt 9 → **P17** |
| kein Rate Limiting | Throttler: Login 5/min plus „großzügiges globales Limit“ | 10: 429 beim Login; globales Limit **ohne Zahl und ohne Prüfung** | teilweise → **P16** |
| teure Endpunkte | SQL, Index, Cache, Obergrenzen (C1 A06) | 9 und 14: p95 < 200 ms | ✔ (Cache-Fehler → **P02**) |
| Stacktraces, `lastError` öffentlich | `ApiExceptionFilter`, `NODE_ENV=production`, Status ohne Fehlertext | 5: 500 ohne `stack`; 2/12a: kein Fehlertext | ✔ |
| npm-audit-Funde | Express 4, axios, node-cron fallen weg; `npm audit` | 11: 0 high/critical | ✔ (Express läuft bis Schritt 9 weiter → **P17**) |
| `express.json()` ohne Bedarf | Body-Limit 64 KB; ein JSON-Parser ist künftig nötig (POST, PATCH) | 5: Body-Limit | ✔ |
| öffentliches Repo, E-Mail in Commits | C2: künftig noreply-Adresse, offene Frage 8 | **kein Schritt** | Lücke → **P18** |
| Analytics-ID in `angular.json` | B5.1, C1 A03 | 0.3 Aufgabe, **keine Prüfung** | teilweise → **P18** |
| `npx -y` ohne Version | C1 A03 | 0.3 Aufgabe, **keine Prüfung** | teilweise → **P18** |
| README-Domain | F34 | 0.3: `grep keymetrics` | ✔ |
| (ergänzend) kein Timeout, keine Prüfung der Open-Meteo-Antworten | B4.8 Timeout, C1 A08 | 3: `AbortSignal.timeout`; Prüfung fehlt | → **P15** |

---

## 5. Kontraste (02 E3, `tokens.css`, Kontrasttabellen)

### 5.1 Nachgerechnete Werte der Tabelle E3.3

Alle Werte gerechnet und auf zwei Stellen gerundet. **Alle Angaben in E3.3 (#1–#43) und in den Kommentaren von `tokens.css` stimmen.** Auch die Einstufungen in normalen Text, großen Text und Nicht-Text stimmen.

| # | Kombination | angegeben | gerechnet | Schwelle | ok |
|---|---|---|---|---|---|
| 1–3 | text `#1B1F24` auf bg / surface / surface-muted | 14,81 / 15,87 / 13,58 | 14,81 / 15,87 / 13,58 | 4,5 | ✔ |
| 4 | text-muted `#3E434A` auf bg / surface / muted | 8,92 / 9,55 / 8,17 | 8,92 / 9,55 / 8,17 | 4,5 | ✔ |
| 5 | text-subtle `#5A5F66` | 5,76 / 6,16 / 5,28 | 5,76 / 6,16 / 5,28 | 4,5 | ✔ |
| 6 | accent-strong `#A04512` | 5,60 / 6,00 / 5,13 | 5,60 / 6,00 / 5,13 | 4,5 | ✔ |
| 7 | `#8A3B0F` | 6,92 / 7,42 / 6,35 | 6,92 / 7,42 / 6,35 | 4,5 | ✔ |
| – | `#74310C` (Token-Kommentar 7,87–9,20) | 7,87–9,20 | bg 8,59 · surface 9,20 · muted 7,87 | 4,5 | ✔ |
| 8 | accent `#C2571A` | 4,02 / 4,31 / 3,69 | 4,02 / 4,31 / 3,69 | 3 (groß) | ✔, für normalen Text richtig als „nein“ eingestuft |
| 9 | accent-bright `#E8772E` | 2,64 / 2,83 / 2,42 | 2,64 / 2,83 / 2,42 | – | ✔ nur Deko |
| 10, 11 | `#FBFAF7` auf `#A04512` / `#8A3B0F` / `#74310C` | 6,00 / 7,42 / 9,20 | 6,00 / 7,42 / 9,20 | 4,5 | ✔ |
| 13 | text auf border `#D6D1C7` | 10,89 | 10,89 | 4,5 | ✔ |
| 14 | surface auf text | 15,87 | 15,87 | 4,5 | ✔ |
| 15 | danger `#A3242B` | 6,60 / 7,07 / 6,05 | 6,60 / 7,07 / 6,05 | 4,5 | ✔ |
| 16 | danger auf danger-bg `#F7E7E4` | 6,15 | 6,15 | 4,5 | ✔ |
| 17 | text / muted / subtle auf danger-bg | 13,80 / 8,31 / 5,36 | 13,80 / 8,31 / 5,36 | 4,5 | ✔ |
| 18 | accent-strong auf danger-bg | 5,22 | 5,22 | 4,5 | ✔ |
| 19 | success `#2F6A3B` | 5,79 / 6,20 / 5,31 | 5,79 / 6,20 / 5,31 | 4,5 | ✔ |
| 20, 21 | auf success-bg `#E6EEE2` | 5,45 / 13,95 / 8,40 | 5,45 / 13,95 / 8,40 | 4,5 | ✔ |
| 22, 23 | border-control `#7D776C` | 3,97 / 4,26 / 3,64 / 3,70 | 3,97 / 4,26 / 3,64 / 3,70 | 3 | ✔ |
| 24 | danger-Rahmen auf surface | 7,07 | 7,07 | 3 | ✔ |
| 25 | Fokus `#C2571A` | 4,02 / 4,31 / 3,69 | 4,02 / 4,31 / 3,69 | 3 | ✔ |
| 26 | border / border-strong auf surface | 1,46 / 1,68 | 1,46 / 1,68 | – | ✔ Deko |
| 27–30 | Dunkelbereich Texte | 14,81 / 12,76 / 10,89 / 9,38 / 9,45 / 8,14 | identisch | 4,5 | ✔ |
| 31–33 | `#E8772E` auf `#1B1F24` / `#262B31`; `#F09A5C` | 5,61 / 4,83 / 7,48 | 5,61 / 4,83 / 7,48 | 4,5 | ✔ |
| 34 | `#1B1F24` auf `#E8772E` / `#F09A5C` / `#F4B382` | 5,61 / 7,48 / 9,16 | identisch | 4,5 | ✔ |
| 35 | `#C2571A` dunkel | 3,68 / 3,17 | 3,68 / 3,17 | 3 | ✔ (wird nicht verwendet) |
| 36 | `#3A4047` | 1,58 | 1,58 | – | ✔ Deko |
| 37–41 | Diagramm | 4,31/3,69 · 5,55/4,75 · 6,16/5,28 · 6,16 · 15,87/13,58 | identisch | 3 | ✔ |
| 42, 43 | Gitter, Band | 1,46 · 1,17 | 1,46 · 1,17 | – | ✔ Deko |
| Hinweis | Temperaturlinie gegen Balken | 1,29 | 1,29 | – | ✔ über Form und Legende gelöst |
| E3.7.2 | Fokusring gegen Primärfläche | 1,39 | 1,39 | – | ✔ durch den Abstand von 2 px ausgeschlossen |

### 5.2 Kombinationen, die Komponenten verwenden, die aber nicht in der Tabelle stehen

| Kombination | Wo | gerechnet | Schwelle | Ergebnis |
|---|---|---|---|---|
| Fokus `#C2571A` auf danger-bg `#F7E7E4` | Button „Erneut versuchen“ und Link in der Fehlerbox (E3.7.7) | 3,75 | 3 | ✔, fehlt in der Tabelle → **P23** |
| Fokus `#C2571A` auf success-bg `#E6EEE2` | Link oder Button in der Erfolgsbox | 3,79 | 3 | ✔, fehlt → **P23** |
| `#F09A5C` auf `#262B31` | Link-Hover im Dunkelbereich bei hover-Fläche | 6,44 | 4,5 | ✔, fehlt → **P23** |
| `#8A3B0F` / `#74310C` auf danger-bg | Link-Hover/-Aktiv in der Fehlerbox | 6,45 / 8,00 | 4,5 | ✔, fehlt → **P23** |
| Ladebalken `--color-accent` `#C2571A` direkt an der 6-px-Kante `#E8772E` | E3.7.8 „oben in der Karte ein 2-px-Ladebalken“ | **1,52** | 3 (Nicht-Text) | Der Balken ist gegen die Kante kaum zu sehen. Die Information trägt zusätzlich der Chip „LÄDT …“, deshalb ist es kein harter Verstoß → **P22** |
| `--color-danger` `#A3242B` in `.surface-dark` (nicht überschrieben) | Fehlerbox oder Feldfehler in Header, Hero oder Footer | **2,24** | 4,5 | Verstoß, falls es dort vorkommt. `.surface-dark` überschreibt `danger`, `danger-bg`, `success`, `success-bg`, `border-control` und `accent` nicht → **P23** |
| `--color-border-control` in `.surface-dark` | Sekundärbutton im Dunkelbereich | 3,73 | 3 | ✔ (zufällig) |
| **Übergangsfokus `#C2571A` auf dem alten Header-Verlauf** `#0369a1 → #0ea5e9 → #38bdf8` (`app.css:2`) und Footer `#0369a1` | 04 Schritt 0.2 | **1,32 / 1,62 / 2,10** | 3 | **Verstoß**, F07 bleibt bis Schritt 1 bestehen → **P10** |
| Vorschlag für 0.2: zweifarbiger Ring `#1B1F24` mit weißem Saum | Header alt | dunkel 2,79 / 5,98 / 7,73, weiß 5,93 / 2,77 / 2,14: an jeder Stelle ist eine der beiden Farben ≥ 3 | 3 | ✔ |
| Ladebalken in `--color-text` `#1B1F24` | Vorschlag zu P22 | gegen Kante 5,61, gegen surface 15,87 | 3 | ✔ |

---

## 6. Prüfbarkeit der Akzeptanzkriterien

Die meisten AKs in 03 B1.2 nennen Anfrage, Statuscode und Feld. Das ist vorbildlich. Unscharf oder so nicht ausführbar sind:

| Stelle | Kriterium | Problem | Befund |
|---|---|---|---|
| US09-3 | „ungefähr gleiche Laufzeit“ | kein Maß | **P20** |
| US12-3 | „soweit Open-Meteo Werte hat“ | Ergebnis hängt vom fremden Dienst ab | **P20** |
| US13-7 | „400, kein Messwert angegeben“ | `field` und `code` fehlen (laut B3.3 `field: null`) | **P20** |
| US04-7, US06-6, US10-6, US12-2 | nur „400“ bzw. „über 1096 Tage“ | kein `field`/`code`; bei US10-6 kein konkretes Datum | **P20** |
| US08-3 | „Die Stunde 19.11. 23:00 hat danach …“ | keine Anfrage genannt, über die man das beobachtet | **P20** |
| US03-3, US09-5, US13-6, US19-6, US20-5 | `code: "unrecognized_keys"` bzw. `code = "VALIDATION_FAILED"` | Es bleibt offen, ob der `code` oben im Fehler oder in `errors[]` gemeint ist | **P20** |
| US16-4, US16-5, US20-6; 04 Schritt 7 „Browser `/`, 14:30“; 12a „Browser US16-4 …“ | feste Uhrzeit und Fixtures im Browser | `Clock` lässt sich nur in Unit- und e2e-Tests setzen. Für die laufende App gibt es keinen Mechanismus | **P13** |
| 04 0.2 | „simulierter 500 (Express gestoppt)“ | Ein gestopptes Express liefert über den Proxy 504/502, keinen 500. Die Schrittfolge fehlt | **P21** |
| 04 0.2 | „Fokusring … sichtbar“ | kein Maß; mit dem Übergangsfokus tatsächlich nicht erfüllt | **P10** |
| 04 1 | `grep -rEn "#[0-9a-fA-F]{3,8}\b…" frontend/src/app` findet nichts | Findet heute `&#8249;`/`&#8250;` in `today-page.html:8,10`. Die Prüfung schlägt also fehl, auch wenn keine Farbe mehr fest steht | **P21** |
| 04 1 | V21 (ganze Monatsachse mit Lücken) | keine Prüfung | **P21** |
| 04 3 | „nach etwa 5 s“ | hängt vom Netz ab | **P21** |
| 04 9 | „gleiche Anzeige wie nach Schritt 8“ | kein Vergleichsverfahren | **P21** |
| 04 11 | „Test-Token ohne Rolle admin“ | Es ist nicht gesagt, wie das Token entsteht | **P21** |
| 04 14 | `sudo systemctl kill wetter-api` → „läuft nach höchstens 10 s wieder“ | `systemctl kill` sendet SIGTERM. Bei `Restart=on-failure` (03 C5) gilt ein Ende durch SIGTERM als sauber, systemd startet **nicht** neu. Das Kriterium schlägt fehl | **P14** |

---

## 7. Endpunkte, ER-Modell, JSON-Beispiele, Pfade in 02 E2 und Roadmap

### 7.1 Angleichung der Pfade (verbindlich ist 03 B3.1, 02 E2.2)

| 02 E2 (Vorschlag) | 03 B3.1 (verbindlich) | Roadmap | Was angleichen |
|---|---|---|---|
| `GET /api/days/{date}` | `GET /api/days/{date}`, dazu `/days/today` und `/days?from&to` | ✔ | – |
| `GET /api/months/{year}/{month}` | `GET /api/summaries/months/{yearMonth}` (`YYYY-MM`), `GET /api/summaries/months?year=` | ✔ | 02 N05, N06, E2-Liste |
| `GET /api/years/{year}` | `GET /api/summaries/years/{year}`, `GET /api/summaries/years` | ✔ | 02 N05, E2-Liste |
| `GET /api/summaries?from&to` | `GET /api/summaries/periods?from&to` | ✔ | 02 N06 |
| `GET /api/forecast-days` (mit `notices`) | `GET /api/forecasts`, `GET /api/notices` | ✔ | 02 N07, E2-Liste |
| `POST /api/tokens` | `POST /api/auth/login`, `GET /api/auth/me` | ✔ | 02 N02, siehe 7.3 und **P09** |
| `POST /api/imports` `{ from, to, type: hourly/archive/forecast }` | `{ kind: range/gaps, from, to, overwriteCorrections? }` | ✔ | 02 N02 |
| `POST /api/corrections`, `GET /api/corrections`, `DELETE /api/corrections/{id}` | `PATCH /api/observations/{id}` + `If-Match`, `GET /api/observations/{id}/corrections` | ✔ | 02 N03; Übersicht fehlt (**P06**), Rücknahme (**P07**) |
| `/api/status`: `lastSuccessAt`, `nextRunAt`, `lastRunState` (never/ok/error), `firstDate`, `lastDate` | `lastSuccessfulUpdateAt`, `nextScheduledUpdateAt`, `updateState` (never/ok/delayed), `dataFrom`, `dataTo`, `daysWithData`, `daysComplete`, `gapCount` | ✔ | 02 N01, N04, V35 |
| V29/N01: Stunde `kind: observed/forecast`, `totals.observed/forecast`, `updatedAt` | `source` + `isPrediction`, `observed`/`predicted` | ✔ | 02 V29, N01 |
| V32: `coverage: { days, expectedDays }` | `daysComplete`, `daysExpected`, `complete` | ✔ | 02 V32, N05 |
| V27: Tabelle `import_job` | Tabelle `import` | ✔ | 02 V27 |
| V31: Tabelle `daily_summary` | berechnet plus Cache (B2.4) | ✔ (Abweichung in 04 dokumentiert) | 02 V31 mit Hinweis versehen |
| Frontend `/admin/anmeldung` | `admin/login` (B5.1) | `/admin/login` | 02 N02 |
| Frontend `/status` (N04, E3.9) | **fehlt** in B5.1 | 12a `/status` | 03 B5.1 → **P29** |

→ Alles zusammen als **P08**.

### 7.2 ER-Modell, JSON-Beispiele und Fehlerformat

| Prüfpunkt | Befund | Nr. |
|---|---|---|
| Observation: JSON ↔ ER | Felder passen (`localHour`, `utcOffsetMin`, `updatedAt` intern). ✔ | – |
| daily_forecast, import, correction, user, role, user_role, location | Felder und Namen passen zum ER (camelCase ↔ snake_case). ✔ | – |
| `correction.field`: DB-`CHECK` in snake_case (`apparent_temperature`), API-Felder in camelCase (`apparentTemperature`) | Die Abbildung ist nicht festgelegt | **P26** |
| Tabelle `notice_threshold` | steht nur im Nachtrag zu B1.2, **fehlt im erDiagram (B2.3) und in B2.6** | **P26** |
| B2.1 Ressourcen | `status`, `health`, `notices`, `summaries/periods` fehlen | **P26** |
| B2.2 JSON-Beispiele | Es gibt kein Beispiel für `status` (die zentrale Gastressource, Felder verstreut über US07, US16 und US17), für die Liste `summaries/years`, für `summaries/periods` und für die Login-Antwort | **P26** |
| Beispielwerte gegen „jetzt = 19.11.2026, 14:30 MEZ (13:30 UTC)“ | `fetchedAt`/`basedOnFetchedAt` `14:01:34Z` (= 15:01 MEZ, also nach „jetzt“), `requestedAt 13:40Z`, `correctedAt 13:42:07Z`, `lastLoginAt 13:35:12Z` liegen in der Zukunft. `createdAt 2026-11-20` liegt nach `lastLoginAt 2026-11-19`. Observation 16503 hat bei Version 3 schon 9,6 °C, die Korrektur auf Version 4 zeigt `oldValue 19.6`. Der Rekord `coldest −13.9` und das Jahresminimum 2026 `−12.4` haben **dieselbe Stunde** | **P27** |
| Fehlerformat B3.3 | Die Zusatzfelder `runningImportId` (US10-7) und `dataFrom` (R03, 04 Schritt 5) sind im Format nicht vorgesehen. Für den 409 aus einer DB-Verletzung (B4.3) und für 413 gibt es keinen `code` | **P28** |
| Statuscodes B3.1 | 406 fehlt bei `/locations/{id}`, `/observations/{id}`, `/observations/{id}/corrections`, `/auth/me`, `/imports…`, `/gaps`, obwohl die Middleware für alle Routen gilt | **P28** |
| Zugriff B4.7 | `GET /auth/me` = „jede gültige Anmeldung“, also weder `@Public` noch `@Roles`. Laut B4.7 und B3.2 gibt das **403**, und der e2e-Test „genau einer der beiden Dekoratoren“ schlägt fehl | **P04** |
| Zugriff in 04 Schritt 10 | „Alle lesenden Endpunkte mit `@Public()`“ würde auch `GET /imports`, `/gaps` und `/corrections` öffnen | **P19** |
| Zählung in Chips | 02 V21, E3.9 und 04 Schritt 8 schreiben „19 VON 30 TAGEN“, 03 US04-4 und US18-5 haben `daysComplete = 18` bzw. „18 VON 30“. 02 E3.9 nennt „688 Tage“ als Datenbasis der Rekorde, `daysCounted` ist 687 | **P30** |

### 7.3 REST-Regel „keine Verben im Pfad“: `/api/auth/login`

- **Befund:** 03 B3.1 schreibt selbst „Im Pfad stehen nur Substantive“, verwendet aber `POST /api/auth/login`. `login` ist ein Verb bzw. eine Aktion. 02 N02 hatte `POST /api/tokens` vorgeschlagen.
- **Empfehlung:** `POST /api/auth/tokens` (Antwort weiter **200**, Body unverändert). `GET /api/auth/me` bleibt.
- **Begründung:**
  1. Der Pfad erfüllt die eigene Regel aus B3.1.
  2. Der `AuthController` (`@Controller('auth')`) und die Gruppierung in Swagger und Postman bleiben gleich. Geändert wird nur ein Pfadsegment.
  3. 200 statt 201 bleibt richtig. Das Token wird nicht gespeichert und hat keine abrufbare Adresse (keine `Location`). Die Begründung aus B3.2 gilt also weiter.
  4. Abmelden bleibt clientseitig; ein `DELETE /api/auth/tokens` ist nicht nötig.
- **Alternative**, falls das Kursskript `/auth/login` ausdrücklich vorgibt: Der Pfad bleibt, und in B3.1 steht unter „REST-Regeln“ eine begründete Ausnahme („Login ist eine Aktion ohne Ressource; Kursmuster, NestJS-Dokumentation“). Ohne einen der beiden Wege widerspricht 03 sich selbst (**P09**).

---

## 8. Entscheidungen (01 Abschnitt 7), Platzhalter, Verweise und Nummern

| Prüfpunkt | Ergebnis | Nr. |
|---|---|---|
| Keine Besucherkonten | eingehalten (03 B1.1, B4.6; N10 abgelehnt) | ✔ |
| Gast „alles lesen“ | 03 B1.1 schließt Importe, Korrekturhistorie und Lücken für Gäste aus. Das ist sachlich richtig (`lastError`, 1.3), steht aber im Widerspruch zum Wortlaut von Abschnitt 7 und ist dort nicht begründet | **P34** |
| Vorhersagestunden nicht in Summen | eingehalten (R08, R11, R13, US06-4) | ✔ |
| Trockentag < 0,1 mm, Rekord = Stundenwert | eingehalten (R09, R11, R27) | ✔ |
| Stack NestJS 11, Zod, TypeORM/SQLite, JWT, Angular bleibt | eingehalten. Die Zusatzpakete sind begründet (03 B4.8) | ✔ |
| Standort in der DB | eingehalten (`location`) | ✔ |
| Platzhalter „B1.x“ | 03 B4.1 (Diagrammknoten „Neue Module aus B1.x“ und Text) und B6. Das Modul `NoticesModule` ist inzwischen festgelegt | **P25** |
| Falsche Verweise | 03 Abschnitt 0 N1 „B2.6, Schritt 2“, US15-5 „B2.6, Schritt 9“ und R07 „Migrationsregel aus B2.6“ meinen B2.7. 02 V14 „(E3.7.9)“ meint E3.7.8. 02 N07 „Hinweisbox (E3.7.8)“ meint E3.7.7 | **P24** |
| Nummern | 03 Abschnitt 0 nennt Zusatzbefunde „N1–N4“ und kollidiert damit mit den Funktionen N01–N10 (z. B. US08 „Behebt … N3“) | **P32** |
| veraltete Stellen | 02 Fragen 3, 6 und 8 sind durch E2.2 beantwortet. 03 B3.7 Postman nennt nur „US01 … US15“. 02 N03 nennt „Grund ≥ 5 Zeichen“ und „nur Temperatur und Niederschlag“, 03 R16 und B2.6 sagen 3 Zeichen und 6 Felder | **P33** |
| Ordner `backend/` gegenüber `api/` | 03 B4.1 (`backend/src/`) und B2.7 Schritt 3 (`backend/test/characterization/`) gegenüber 04 (`api/…`). Laut 04 A1 erst in Schritt 14 angeglichen | **P31** |
| Abhängigkeiten der Schritte | 04 Schritt 2 hängt laut Übersicht nur von 0.1 ab, nutzt aber „die Komponenten aus Schritt 1“. Schritt 1.3 liest `lastFetch` aus dem Express-`/api/status`, das Schritt 2 auf Nest umleitet | **P12** |
| Übergangsvariablen | 04 A4 nennt nur `PORT`, `LEGACY_DATA_DIR` und `SWAGGER_ENABLED`. Vor Schritt 11 werden aber auch `SCHEDULER_ENABLED` (6), `DB_PATH` (9), `JWT_SECRET` und `DEV_ADMIN_PASSWORD` (10) gebraucht | **P35** |
| Laden-Zustand | 03 B5.2 „Skelett …, alter Inhalt bleibt **gedimmt**“ widerspricht 02 E3.7.8 „alte Daten bleiben sichtbar … **kein Abdunkeln**, weil das den Kontrast senken würde“ | **P11** |

---

## Gesamtliste aller Befunde

| Nr. | Schwere | Dokument/Abschnitt | Problem | Korrekturvorschlag |
|---|---|---|---|---|
| P01 | **hoch** | 03 B4.4 (Seeds, `db:reset`); 04 Schritt 9, A5 | `db:seed` und `db:reset` sind nur bei `NODE_ENV=production` gesperrt. `db:reset` löscht `DB_PATH`. Laut 04 A5 sammelt der Entwicklungsrechner ab Schritt 9 bis Schritt 14 die **echten** Daten in genau diesem `DB_PATH` (`%LOCALAPPDATA%\wetter-heubach\weather.db`). Ein Reset oder Seed zerstört bzw. verfälscht sie. Das ist das Muster von F16 noch einmal; V34 verlangte ausdrücklich eine eigene Test-DB | 03 B4.4: (1) Seeds und `db:reset` verweigern, wenn in `import` ein Eintrag mit `kind IN ('legacy','scheduled')` steht, außer bei `--force-delete-collected-data`. (2) Für Entwicklung eine eigene Datei `DB_PATH=…\weather.dev.db`; die Sammel-DB heißt `weather.db`. (3) `db:reset` legt vorher `VACUUM INTO …-before-reset.db` an. 04 Schritt 9 „Fertig, wenn …“ ergänzen: „`npm run db:reset` gegen die Sammel-DB → Abbruch, Exit-Code ≠ 0, DB unverändert“ |
| P02 | **hoch** | 03 B2.4 (Cache), B2.7 Schritt 8 (Upsert), B3.4 (PATCH); 04 Schritte 9, 12a | Der Cache-Schlüssel ist `MAX(updated_at)` + `COUNT(*)`. Upsert (`INSERT … ON CONFLICT DO UPDATE SET …`) und PATCH (`UPDATE observation SET …, version = version + 1`) sind rohes SQL. TypeORM setzt `@UpdateDateColumn` nur bei `save()`, und kein Befehl nennt `updated_at`. Bei einem Update ohne neue Zeile ändert sich `COUNT(*)` nicht. `records` und `summaries/years` bleiben also nach Korrekturen und Importen **veraltet**, bis der Prozess neu startet. Außerdem erhöht der Upsert `version` nicht, obwohl B3.4 das verlangt („Auch ein Import erhöht `version`“) | 03 B2.7 Schritt 8 und B3.4: Jeder Schreibbefehl setzt ausdrücklich `updated_at = :now, version = version + 1`. Einen Satz in B2.4 ergänzen: „Jeder Schreibweg setzt `updated_at`; Prüfung per e2e“. Neues AK US13-13: „Nach US13-2 liefert `GET /api/records` bzw. `/summaries/years/2026` den neuen Wert ohne Neustart“. In 04 Schritt 12a als Prüfung übernehmen, dazu in Schritt 9: „`range`-Import ändert Werte → `GET /api/records` zeigt sie sofort; `version` +1“ |
| P03 | mittel | 03 R02, R23, B5.1 (monthly-page); 04 Schritt 8 | Die Monatsseite lädt `/days?from&to` für den ganzen Monat (B5.1). Für den laufenden Monat ist `to = 2026-11-30` Zukunft. R02 sagt allgemein „`to` > heute → 400“, R23 sagt nichts dazu. Wörtlich umgesetzt scheitert die Monatsansicht des laufenden Monats | 03 R23 unter „Fehler“ ergänzen: „`to` > heute → **400** `DATE_IN_FUTURE` (Service)“. 03 B5.1 monthly-page: „`to = min(Monatsende, heute)`“. Neues AK US04-9: „`GET /api/days?from=2026-11-01&to=2026-11-30` → 400 `DATE_IN_FUTURE`; das Frontend fragt `to=2026-11-19` → 200, 19 Einträge“. Die x-Achse füllt das Frontend selbst bis zum Monatsende (V21) |
| P04 | mittel | 03 B4.7, B3.2; 04 Schritt 11 | `GET /auth/me` ist als „Login (jede gültige Anmeldung)“ eingestuft, hat also weder `@Public` noch `@Roles`. Laut B4.7 antwortet der RolesGuard dann mit 403, und der e2e-Test „jede Route hat genau einen der beiden Dekoratoren“ schlägt fehl. US09-8 (200 mit gültigem Token) ist so nicht erfüllbar | 03 B4.7: `GET /auth/me` bekommt `@Roles('admin')` (es gibt nur Admin-Konten), Zeile in der Tabelle ändern. Alternativ einen dritten Dekorator `@Authenticated()` einführen und die Regel in B4.7, B4.3 und 04 Schritt 11 auf „genau einer von `@Public`, `@Authenticated`, `@Roles`“ erweitern |
| P05 | mittel | 03 B1.2 US01, US02, US04, US05; 04 Schritt 0.4 | Die Bedienung der bestehenden Seiten hat keine Story-AKs: Pfeile ‹ ›, Datumsfeld, **Button „Heute“** (kommt in 03 und 04 gar nicht vor), Sperre von › an heute, Auswahl von Monat und Jahr, Monats- und Jahresdiagramm. Gefühlte Temperatur und Wind im Hero werden nicht geprüft (`current` liefert nur `observationId`) | 03 B1.2 ergänzen, je als Browser-Prüfschritt: **US01-6** „`/`, 1280 px: Hero zeigt Temperatur, ‚Gefühlt …‘ und Wind der Stunde 14:00 aus `hours[]`“. **US02-8** „`/tag/2026-11-10`: ‹ → URL `/tag/2026-11-09`, › → zurück“. **US02-9** „an `/`: › ist `disabled`“. **US02-10** „Button ‚Heute‘ auf `/tag/2026-11-10` → URL `/`, Datumsfeld = heute“. **US02-11** „Datumsfeld wählt 2026-11-05 → URL `/tag/2026-11-05`, genau 1 Request“. **US04-10** „`/monat/2025/03`: Felder zeigen 2025/März; Monat wechseln → URL ändert sich, 2 Requests (Summary + Days); Diagramm-x-Achse 1.–31.“. **US05-7** „`/jahr/2025`: Diagramm mit 12 Monaten“. In 04 Schritt 0.4 eine Prüfung für den Button „Heute“ ergänzen |
| P06 | mittel | 03 B3.1, B2.1, B4.7, US13; 02 N03, E3.7.5, E3.9; 04 Schritt 12a | N03 „Korrektur **mit Änderungsprotokoll**“ ist angenommen, und 02 sieht eine Admin-Tabelle der Korrekturen vor. 03 bietet nur `GET /observations/{id}/corrections`. Ohne bekannte `id` sieht der Admin keine Übersicht | 03 B3.1 und B4.7: `GET /api/corrections?from={date}&to={date}&page&limit` (Rolle `admin`, nur lesend, sortiert nach `correctedAt` absteigend, `{ items, meta }`, R23/R24 sinngemäß). Neues AK US13-13/-14 (200 mit Eintrag aus US13-2; ohne Token 401). In B2.1 die Ressource `corrections` ergänzen. In 04 Schritt 12a Aufgabe und Prüfung ergänzen, Frontend: Tabelle auf `/admin/korrektur` |
| P07 | mittel | 02 N03, E2.2; 03 Offene Frage 3; 04 „Nicht eingeplant“ | Die Rücknahme einer Korrektur (`DELETE /api/corrections/{id}`) ist Teil des angenommenen N03-Vorschlags. 03 führt sie als offene Frage („bisher keine Funktion“), 04 plant sie nicht ein. Damit ist N03 nur teilweise geplant, ohne dass das jemand entschieden hat | 02 E2.2 in der Zeile N03 ergänzen: „angenommen **ohne** Rücknahme; Rücknahme offen (03, Frage 3)“. In 02 N03 den DELETE-Punkt als „offen“ markieren. Wird die Rücknahme gewünscht: 03 B3.1 `POST /api/observations/{id}/corrections/{cid}/reversal` oder `PATCH` mit Altwert (kein DELETE, weil die Historie bleibt) und eine Story US13-15 |
| P08 | mittel | 02 E2 (Liste „Öffentliche Ressourcen“, N01–N07), V27, V29, V31, V32, V35 | Die Pfade und Feldnamen in 02 weichen von 03 B3.1 ab (Tabelle 7.1). E2.2 kündigt die Angleichung in Phase 3 an | 02 E2: Die Liste „Öffentliche Ressourcen“ durch die Zuordnungstabelle aus 7.1 ersetzen. In N01–N07 den Punkt „Ressourcen und Endpunkte“ auf die Pfade aus 03 umschreiben. In V27, V29, V32 und V35 die Feldnamen anpassen (`import`, `source`/`isPrediction`, `observed`/`predicted`, `daysComplete`/`daysExpected`/`complete`, `dataFrom`/`dataTo`). In V31 vermerken: „umgesetzt als Berechnung plus Cache (03 B2.4)“ |
| P09 | niedrig | 03 B3.1 (REST-Regeln), B1.1, US09, B3.2, B4.6, B4.7, B7; 04 Schritt 10 | `POST /api/auth/login` widerspricht der eigenen Regel „nur Substantive im Pfad“ | Empfehlung (siehe 7.3): überall `POST /api/auth/tokens`, Status 200 bleibt. Alternativ: Pfad behalten und eine begründete Ausnahme in 03 B3.1 „REST-Regeln“ aufnehmen |
| P10 | mittel | 04 Schritt 0.2 (Aufgabe V05, Prüfung „Fokusring sichtbar“), Abdeckungsmatrix F07 | Die Übergangsfokusfarbe `#C2571A` erreicht auf dem alten Header-Verlauf (`#0369a1`/`#0ea5e9`/`#38bdf8`) nur **1,32 / 1,62 / 2,10:1** und auf dem Footer `#0369a1` 1,32:1. F07 (hoch) ist in 0.2 also nicht behoben, die Matrix nennt aber nur 0.2 | 04 Schritt 0.2: Übergangsring zweifarbig: `outline: 3px solid #1B1F24; box-shadow: 0 0 0 5px #FFFFFF` (an jeder Stelle des Verlaufs ≥ 3:1, siehe 5.2). Prüfung messbar machen: „Kontrast des Fokusrings gegen die angrenzende Farbe ≥ 3:1 an Navigation, Logo, Footer-Link, Datumsfeld (DevTools-Farbwähler)“. Matrix: F07 → „0.2, 1“ |
| P11 | mittel | 03 B5.2 (Zeile „Laden“) gegenüber 02 E3.7.8 | 03 sagt „Skelett …, alter Inhalt bleibt **gedimmt**“, 02 sagt „alte Daten bleiben sichtbar …, **kein Abdunkeln**“ (Kontrast) und Skelett nur beim ersten Laden | 03 B5.2 die Zeile „Laden“ in zwei Zeilen teilen: „Erstes Laden: Skelett in Endgröße, `aria-live`-Text“ und „Wechsel der Auswahl: alter Inhalt **unverändert**, `aria-busy="true"`, Ladebalken, Chip ‚LÄDT …‘ (02 E3.7.8)“. Das Wort „gedimmt“ streichen |
| P12 | mittel | 04 Übersicht (Abhängigkeit Schritt 2), Schritt 1 Aufgabe 3, Schritt 2 (Frontend, „Design“) | Schritt 2 hängt nur von 0.1 ab, sein Footer nutzt aber „die Komponenten aus Schritt 1“. Schritt 1.3 liest übergangsweise `lastFetch` aus dem Express-`/api/status`, das Schritt 2 auf Nest umleitet (ohne `lastFetch`). Je nach Merge-Reihenfolge bricht der Footer | 04 Schritt 2: Frontend-Teil nur `models/api.ts`, `weather.service.getStatus()/getLocation()` und die Network-Prüfung. Die Footer-Anzeige zieht in den Schritt um, der als zweiter von 1 und 2 gemergt wird, und die Prüfung „Footer zeigt Heubach“ wandert mit. Schritt 1.3: Footer liest `dataFrom`/`dataTo` aus dem Nest-`/api/status`, falls Schritt 2 schon gemergt ist, sonst nur statischen Text. Alternativ in der Übersicht die Abhängigkeit „2 → 1 (nur Frontend-Teil)“ eintragen |
| P13 | mittel | 03 US16-4, US16-5, US20-6, B4.8 (EnvSchema); 04 Schritte 7 und 12a (Browser-Prüfungen) | Die Browser-AKs setzen „14:30“, „Status delayed“ oder „Fixture US20-1“ voraus. `Clock` lässt sich aber nur in Unit- und e2e-Tests setzen. In der laufenden App gibt es dafür keinen Weg, die AKs sind so nicht ausführbar | 03 B4.8: Variable `FAKE_NOW` (ISO-Zeitpunkt, `z.iso.datetime().optional()`), nur erlaubt bei `NODE_ENV ∈ {development, test}`; in Produktion startet der Prozess mit gesetztem `FAKE_NOW` nicht (fail fast). Dazu `db:seed --fixture <name>` (z. B. `us16-delayed`, `us20-frost`) in eine eigene Dev-DB (siehe P01). In US16-4/-5, US20-6 und 04 Schritt 7 die Zeile „Vorbedingung: `FAKE_NOW=2026-11-19T13:30:00Z`, Fixture …“ ergänzen. Zeitzone des Browsers: DevTools-Sensoren „Europe/Berlin“ |
| P14 | mittel | 04 Schritt 14 („`sudo systemctl kill wetter-api`“); 03 C5 | `systemctl kill` sendet standardmäßig SIGTERM. Mit `Restart=on-failure` startet systemd nach SIGTERM **nicht** neu, die Prüfung schlägt also fehl | 04 Schritt 14: `sudo systemctl kill -s SIGKILL wetter-api` → „läuft nach höchstens 10 s wieder“. 03 C5 Prozessmanager: `RestartSec=2` ergänzen |
| P15 | niedrig | 03 B1.3 (fehlende Regel), C1 A08; 04 Schritt 3 | 01 1.2 „gültiges JSON ohne `hourly` → 500“ und 1.3 „Antworten nicht validiert“. Die Prüfung steht nur in C1 A08, ohne Regel, Ort und Test | 03 B1.3 neue Regel **R32 „Antwort des Wetterdienstes“**: Zod-Schema `OpenMeteoResponseSchema` im `WeatherProviderModule`. Fehler: `hourly` fehlt, Arrays ungleich lang, `utc_offset_seconds ≠ 0` → Import `failed` mit `error.code = "UPSTREAM_INVALID"`. Ort: Zod (Provider) plus Service. 04 Schritt 3 „Fertig, wenn …“: „Unit-Test: Mock liefert `{}` → Import `failed`, `UPSTREAM_INVALID`, nichts geschrieben“ |
| P16 | niedrig | 03 B4.8, C1 A06/A07; 04 Schritt 11 | Das „großzügige globale Throttle-Limit“ gegen teure Abfragen hat keine Zahl und keine Prüfung | 03 B4.8: `THROTTLE_GLOBAL_LIMIT` (Standard 120 Anfragen pro 60 s und IP), in C1 A06 nennen. 04 Schritt 11 „Fertig, wenn …“: „121 Anfragen in 60 s auf `/api/records` → die 121. liefert **429** `TOO_MANY_REQUESTS`“ |
| P17 | niedrig | 04 Schritt 0.2 (Express-Fix), Grundsatz 3 | Express läuft bis Schritt 9 (voraussichtlich Wochen) weiter auf 0.0.0.0 mit CORS `*` und den 8 audit-Funden (body-parser und qs sind aus dem LAN erreichbar) | 04 Schritt 0.2 Aufgabe „E (Express, klein)“ ergänzen: `app.listen(PORT, '127.0.0.1')`, `cors()` entfernen (der Dev-Proxy liefert dieselbe Origin). Prüfung: „`curl http://<LAN-IP>:3000/api/status` von einem anderen Gerät → Verbindung abgelehnt“ |
| P18 | niedrig | 04 Schritte 0.1 und 0.3; 03 C2 | Die noreply-Adresse aus C2 hat keinen Schritt. Analytics-ID und feste MCP-Version sind Aufgaben in 0.3, aber ohne Prüfung | 04 Schritt 0.1 Aufgabe: `git config user.email "<id>+<name>@users.noreply.github.com"` (nur lokal im Repo). 04 Schritt 0.3 „Fertig, wenn …“: „`grep -c analytics frontend/angular.json` = 0“ und „`.vscode/mcp.json` enthält `@angular/cli@<feste Version>` und kein `-y`“ |
| P19 | niedrig | 04 Schritt 10 (Aufgabe „Alle lesenden Endpunkte mit `@Public()`“, Prüfungen) | Der Wortlaut würde auch `GET /imports`, `/imports/{id}`, `/gaps` und `/observations/{id}/corrections` öffnen. Der Test „genau ein Dekorator“ fiele dann nicht auf | 04 Schritt 10: „Alle **Gast**-Endpunkte laut 03 B4.7 (Zeilen ‚öffentlich‘) mit `@Public()`“. Prüfung ergänzen: „`GET /api/imports` ohne Token → **401** (US11-5)“ |
| P20 | niedrig | 03 B1.2: US09-3, US12-3, US13-7, US04-7, US06-6, US10-6, US12-2, US08-3 sowie die `code`-Angaben in US03-3, US09-5, US13-6, US19-6, US20-5 | unscharfe AKs (siehe Abschnitt 6) | US09-3: „Median von 10 Anfragen unterscheidet sich um höchstens 50 ms von US09-2“. US12-3: „mit gemocktem Provider (alle Stunden vorhanden) → `items = []`“. US13-7: „400, `errors[0] = { field: null, code: "missing_measurement" }`“. US04-7, US10-6 (konkret `from=2023-01-01&to=2026-01-01`), US12-2: `field: "to"`, `code` ergänzen. US06-6: `errors[0].field = "year"`, `code: "unrecognized_keys"`. US08-3: „über `GET /api/days/2026-11-19` → `hours[23].source = "forecast_api"`“. Schreibweise vereinheitlichen: oben `code = "VALIDATION_FAILED"`, Feldfehler als `errors[0].code = "unrecognized_keys"` |
| P21 | niedrig | 04 Schritte 0.2, 1, 3, 9, 11 (Prüfungen) | unscharfe oder falsche Prüfungen (siehe Abschnitt 6) | 0.2: „Express stoppen, dann ‹ klicken → Fehlerbox, keine Werte des vorigen Tags (Proxy 504)“. 1: Hex-Suche auf `--include=*.css --include=*.ts` beschränken oder `&#8249;`/`&#8250;` durch die Zeichen ‹ › ersetzen. 1: Prüfung für V21 ergänzen: „`/monat/2026/11`: x-Achse 1–30, Lücke ab dem 19.“. 3: „Polling bis Status ≠ `queued`/`running`, höchstens 30 s“. 9: „Screenshots aller 4 Routen 1280 px gegen `docs/umbau/screenshots/nachher/` aus Schritt 8; Kennzahlen identisch bis auf die Abweichungsliste“. 11: „Test-Token mit `JwtService.sign({ sub: 99, roles: [] })` im e2e-Test“ |
| P22 | niedrig | 02 E3.7.8 (Ladebalken), E3.3 | Der 2-px-Ladebalken in `--color-accent` sitzt „oben in der Karte“ direkt an der 6-px-Kante `#E8772E`: 1,52:1. Die Kombination steht nicht in der Tabelle | 02 E3.7.8: Ladebalken in `--color-text` (5,61 gegen die Kante, 15,87 gegen surface) **oder** mit 2 px Abstand unter der Kante. Zeile in E3.3 ergänzen |
| P23 | niedrig | 02 E3.3, E3.2 (`.surface-dark`) | In der Tabelle fehlen Kombinationen, die vorkommen: Fokus auf danger-bg 3,75 und success-bg 3,79, `#F09A5C` auf `#262B31` 6,44, `#8A3B0F`/`#74310C` auf danger-bg 6,45/8,00, `#74310C` auf bg 8,59. `.surface-dark` überschreibt `--color-danger` (dort 2,24:1), `danger-bg`, `success`, `success-bg`, `border-control` und `accent` nicht | 02 E3.3: die Zeilen mit den Werten aus 5.2 ergänzen. In E3.2 unter Abschnitt 10 eine Regel aufnehmen: „Fehler-, Erfolgsboxen und Formularfelder kommen in `.surface-dark` nicht vor“ (oder dunkle Werte definieren und nachrechnen) |
| P24 | niedrig | 03 Abschnitt 0 (N1), US15-5, R07; 02 V14, N07 | falsche Abschnittsverweise | 03: „B2.6, Schritt 2“, „B2.6, Schritt 9“ und „Migrationsregel aus B2.6“ → **B2.7**. 02 V14 „(E3.7.9)“ → **E3.7.8**. 02 N07 „Hinweisbox (E3.7.8)“ → **E3.7.7** |
| P25 | niedrig | 03 B4.1 (Diagramm und Text), B6 | Platzhalter „Neue Module aus B1.x“ bzw. „(B1.x)“ | 03 B4.1: Knoten `New` ersetzen durch `Notices["NoticesModule<br/>notice_threshold"]` mit `Notices -- "importiert" --> Fc` und `App --> Notices`. Ergänzen: `Status -- "importiert" --> Stats`, weil `daysComplete` (US17-1) das Aggregat braucht. Text „Neue Funktionen (B1.x)“ → „Neue Funktionen (B1.2, US16–US20)“. B6: „(B1.x)“ → „(B1.2)“ |
| P26 | niedrig | 03 B2.1, B2.2, B2.3, B2.6 | `notice_threshold` fehlt im erDiagram und in B2.6. B2.1 fehlen `status`, `health`, `notices`, `summaries/periods`. Es gibt kein JSON-Beispiel für `status`, `summaries/years` (Liste), `summaries/periods` und die Login-Antwort. Die Abbildung `correction.field` (snake_case in der DB) auf die camelCase-Felder der API ist offen | B2.3: Entität `NOTICE_THRESHOLD` mit den Spalten aus dem Nachtrag zu B2 (B1.2). B2.6: Zeile `notice_threshold` mit den drei `CHECK`s. B2.1: vier Zeilen ergänzen. B2.2: Beispiel `status` (`today`, `timezone`, `dataFrom`, `dataTo`, `lastSuccessfulUpdateAt`, `nextScheduledUpdateAt`, `updateState`, `daysWithData`, `daysComplete`, `gapCount`), Liste `summaries/years` (`items: [{ id, year, complete, daysComplete }]`) und Login-Antwort aus B4.6. In B2.2 bei `correction` festlegen: `field` steht in der API in camelCase, der Mapper setzt es in snake_case um |
| P27 | niedrig | 03 B2.2, US20-1 | Beispielwerte passen nicht zu „jetzt = 14:30 MEZ“ und nicht zueinander (siehe 7.2) | Zeiten vor 13:30Z legen: `fetchedAt`/`basedOnFetchedAt` → `2026-11-19T13:05:12Z` (passt zu „Stand 14:05“), `requestedAt` 13:10Z, `correctedAt` 13:20Z, `lastLoginAt` 13:08Z. `createdAt` von Location und User auf `2026-11-19T09:00:00Z`. Observation 16503 bei Version 3 mit `temperature: 19.6`. Jahresminimum 2026 auf `-13.9` setzen oder den Rekord auf eine andere Stunde legen |
| P28 | niedrig | 03 B3.3, B3.1, B4.3 | Zusatzfelder (`runningImportId`, `dataFrom`) sind im Fehlerformat nicht vorgesehen. Für DB-Konflikt 409 und 413 gibt es keinen `code`. 406 fehlt in mehreren Zeilen von B3.1 | B3.3: optionales Objekt `details` (z. B. `{ "runningImportId": 42 }`, `{ "dataFrom": "2025-01-01" }`); US10-7 und R03 darauf umstellen. Codes `CONFLICT` und `PAYLOAD_TOO_LARGE` ergänzen. B3.1: 406 in allen Fehlerspalten ergänzen (die Middleware gilt global), bei Admin-Routen nach 401/403 |
| P29 | niedrig | 03 B5.1 (`app.routes.ts`), US17-5 | Öffentliche Route `/status` (US17, 02 E3.9) fehlt. US17-5 verlinkt „Importprotokoll ansehen →“ auf `/admin`, das ist laut B5.1 die Admin-Statusseite | B5.1 `app.routes.ts`: `status` (öffentlich, `title`) ergänzen und `status-page` auch unter `pages/`. US17-5: Linkziel `/admin/importe` |
| P30 | niedrig | 04 Schritt 8; 02 V21, E3.9 | Chip „19 VON 30 TAGEN“ gegenüber `daysComplete = 18` (US04-4, US18-5). Rekordhinweis „688 Tage“ gegenüber `daysCounted = 687` | 04 Schritt 8 und 02 V21/E3.9: „18 VON 30 TAGEN“ (= `daysComplete`/`daysExpected`). 02 E3.9 Rekorde: „687 vollständige Tage“ bzw. Wert aus `daysCounted` |
| P31 | niedrig | 03 B4.1 (Verzeichnisstruktur), B2.7 Schritt 3, Anhang; 04 A1 | Ordner `backend/src`, `backend/test/characterization/` in 03 gegenüber `api/` in 04 | 03 jetzt angleichen statt in Schritt 14: `api/src/…`, `api/test/characterization/golden/`. 04 A1 entsprechend kürzen |
| P32 | niedrig | 03 Abschnitt 0, US08 | Zusatzbefunde „N1–N4“ kollidieren mit den Funktionen N01–N10 | 03 Abschnitt 0 in „Z1–Z4“ (Zusatzbefund) umbenennen und alle Verweise anpassen (US08, B2.7, B2.5, C7 Nr. 10, Anhang, Annahme A1) |
| P33 | niedrig | 02 Offene Fragen 3, 6, 8, N03; 03 B3.7 | Veraltete Stellen: Fragen durch E2.2 beantwortet. Postman nur bis US15. N03 nennt „Grund ≥ 5 Zeichen, nur Temperatur und Niederschlag“, 03 R16/B2.6 sagen 3 Zeichen und 6 Felder | 02: Fragen 3, 6 und 8 als „beantwortet durch E2.2“ markieren. 02 N03 auf 03 R16 verweisen (3–500 Zeichen, 6 Felder) oder 03 auf „nur Temperatur und Niederschlag“ eingrenzen (Entscheidung). 03 B3.7: „US01 … US20“ |
| P34 | niedrig | 03 B1.1 (Rolle Gast) gegenüber 01 Abschnitt 7 | Abschnitt 7: Gast darf „alles lesen“. 03: Importe, Korrekturhistorie und Lücken nur für den Admin, ohne Begründung an dieser Stelle | 03 B1.1 Spalte „Darf nicht“ ergänzen: „(Begründung: Fehlertexte und interne Angaben nicht öffentlich, 01 1.3 `lastError`; ‚alles lesen‘ in Abschnitt 7 bezieht sich auf Wetterdaten und Status)“. Bei Bedarf vom Auftraggeber bestätigen lassen |
| P35 | niedrig | 04 A4, Bezugszeile Schritt 5, US-Matrix | A4 nennt nicht alle Übergangsvariablen (`SCHEDULER_ENABLED` ab 6, `DB_PATH` ab 9, `JWT_SECRET`, `DEV_ADMIN_PASSWORD` ab 10). Schritt 5 nennt US04-6 im Bezug, obwohl `/summaries/months` erst in Schritt 7 entsteht. US03 steht im Bezug von Schritt 7, fehlt aber in der Matrix | 04 A4: Liste ergänzen. Schritt 5 Bezug: US04-6 streichen und in Schritt 8 aufnehmen. Matrix: US03 → „2, 4, 7“, US04 → „5 (Muster), 8“ |
| P36 | niedrig | 03 B1.2 (US13, US19) | N03-Risiko „Hinweis auf der Rekordseite, wenn Korrekturen Rekorde ändern“ (02 N03) ohne Story. N06 nur mit Browser-AK für das Jahr | US06-7: „Ist ein Rekordwert korrigiert (`correctedAt ≠ null`), enthält `records.hottest` `corrected: true`; die Karte zeigt den Chip ‚KORRIGIERT‘“. US19-9: „`/monat/2026/11`, Klick ‚VORJAHR VERGLEICHEN‘ → 2 Requests `/summaries/periods` (2026-11-01..2026-11-18, 2025-11-01..2025-11-18)“ |
| P37 | niedrig | 03 R09/R27, US18-1 gegenüber B2.2 (day) | `isDryDay` ist im Tageseintrag definiert. Für `precipitationDays + dryDays = daysComplete` (US18-1) muss `dryDays` genau wie `isDryDay = true` zählen; das ist nirgends ausdrücklich verknüpft | 03 R27 Spalte „Ort“ ergänzen: „`dryDays` = Anzahl Tage mit `isDryDay = true`, `precipitationDays` = vollständige Tage mit `isDryDay = false`; beide aus derselben Tagesliste“ |

---

## Zählung nach Schwere

| Schwere | Anzahl | Befunde |
|---|---|---|
| hoch | 2 | P01, P02 |
| mittel | 11 | P03, P04, P05, P06, P07, P08, P10, P11, P12, P13, P14 |
| niedrig | 24 | P09, P15–P37 |
| **gesamt** | **37** | |

---

## Umsetzung der Korrekturen (19.11.2026)

Geändert wurden nur `02-verbesserungen-und-design.md`, `03-zielbild.md` und `04-roadmap.md`. `01-analyse.md` und der Code sind unverändert. Neue Kontrastwerte sind nach WCAG 2.2 mit `node -e` nachgerechnet. Neue Nummern sind fortlaufend vergeben: US01-6, US02-8 bis -11, US04-9/-10, US05-7, US06-7, US13-13 bis -18, US19-9, R32, R33, Kontrastzeilen #44–#50. Die Abdeckungsmatrix in 04 ist nachgeführt.

| Nr. | Status | Was geändert wurde (Dokument, Abschnitt) | Bemerkung |
|---|---|---|---|
| P01 | umgesetzt | 03 B4.4 (Seeds und `db:reset` verweigern bei `NODE_ENV=production` und bei `import.kind IN ('legacy','scheduled')`, außer mit `--force-delete-collected-data`; `VACUUM INTO …-before-reset.db`; Sammel-DB `weather.db` und Dev-DB `weather.dev.db`), 03 B4.6, C1 A08; 04 Schritt 9 (Aufgaben, Prüfung `db:reset` gegen die Sammel-DB → Abbruch), Schritt 10 (Dev-Admin nur in der Dev-DB), A5 | – |
| P02 | umgesetzt | 03 B2.4 (Voraussetzung: jeder Schreibweg setzt `updated_at` und `version`), B2.7 Schritt 8 (Upsert), B3.4 (PATCH); neues AK US13-13; 04 Schritt 9 (Upsert, e2e-Prüfung `range`-Import → `/records` sofort aktuell, `version` +1), Schritt 12a (Aufgabe und Prüfung) | – |
| P03 | umgesetzt | 03 R23 (`to` > heute → 400 `DATE_IN_FUTURE`, Ort Zod plus Service), B5.1 monthly-page (`to = min(Monatsende, heute)`), neues AK US04-9; 04 Schritt 8 (Aufgabe und Prüfung) | – |
| P04 | umgesetzt | 03 B4.7 (`GET /auth/me` mit `@Roles('admin')`), B3.1 (403 ergänzt); 04 Schritte 10 und 11 (Dekorator, Prüfung 403 mit Test-Token ohne Rolle) | Variante: `@Roles('admin')` (erste Variante), kein dritter Dekorator |
| P05 | umgesetzt | 03 US01-6, US02-8 bis -11, US04-10, US05-7; 04 Schritt 0.4 (Bezug, Aufgabe Button „Heute“, Prüfungen US02-9 bis -11), Schritt 7 (Browser US01-6, US02-8 bis -11), Schritt 8 (US04-10, US05-7), Matrix US01/US02 | – |
| P06 | umgesetzt | 03 B3.1 und B4.7 (`GET /api/corrections?from&to&page&limit`, Admin, nur lesend, `correctedAt` absteigend), B2.1 (Ressource `corrections`), B2.2 (Beispiel), R23/R24 (Geltung erweitert), B2.6 (`INDEX(corrected_at)`), B5.1 (Route `admin/korrektur`, `corrections-page`), US13-14/-15; 04 Schritt 12a (Aufgaben, Prüfungen); 02 E2, N03, E2.2, E3.9 | Filter `from`/`to` = Berliner Kalendertag von `correctedAt` (Protokoll nach Änderungszeitpunkt) |
| P07 | umgesetzt | 03 R33 (Regel), B3.1 (`POST /api/observations/{id}/corrections/{correctionId}/reversal`, `If-Match`, 200 + ETag), B3.2, B3.3 (`CORRECTION_NOT_REVERSIBLE`), B3.4, B4.7, B2.3/B2.6 (`reverts_correction_id`, `UNIQUE`), B2.2, US13-16 bis -18; offene Frage 3 gestrichen; 04 Schritt 3 (DELETE-Begründung), 12a, „Nicht eingeplant“ und Frage 3 bereinigt; 02 E2.2 und N03 | Nach Vorgabe des Hauptagenten wird die Rücknahme **eingeplant** (statt „angenommen ohne Rücknahme“). Variante: `POST …/reversal` (erste Variante aus 05), kein DELETE. Frage 3 in 03 ist als „gestrichen“ markiert statt gelöscht, damit die Nummern 4–9 gleich bleiben, auf die 04 verweist |
| P08 | umgesetzt | 02 E2 (Liste durch Zuordnungstabelle nach 7.1 ersetzt), N01–N07 (Ressourcen und Endpunkte), V27, V29, V31 (Hinweis Berechnung plus Cache), V32, V35, E2.2 (Schlusssatz), A7; 03 B5.1 und 04 Schritte 10, 11 (Frontend-Route) | Login-Seite einheitlich **`/admin/anmeldung`** (Vorgabe: darf so heißen; passt zu den übrigen deutschen Routen). Deshalb wurden 03 B5.1 und 04 an 02 angeglichen und nicht umgekehrt. V32 nennt jetzt auch die Mittelregel aus 03 R12 |
| P09 | umgesetzt | 03 B1.1, US09-1, B2.2 (Beispiel `token`), B3.1 (Pfad und REST-Regel), B3.2, B4.6, B4.7, B7 (Systemskizze), Annahme A9 (Ausnahme, falls der Kurs `/auth/login` vorgibt); 04 Schritt 10 (Aufgabe, curl-Beispiele, neue Prüfung 415); 02 E2, N02 | `POST /api/auth/tokens`, Erfolg 200, Body unverändert (`accessToken`, `tokenType`, `expiresIn`, `user`), Fehler 400 · 401 · 415 · 429. Das Sequenzdiagramm B4.3 betrifft PATCH und enthält keinen Login-Pfad |
| P10 | umgesetzt | 04 Schritt 0.2 (zweifarbiger Übergangsring `outline: 3px solid #1B1F24; outline-offset: 0; box-shadow: 0 0 0 5px #FFFFFF`, messbare Prüfung ≥ 3:1), Schritt 1 (Ersatz durch `--color-focus`, Prüfung), Matrix F07 → „0.2, 1“ | Nachgerechnet: Ringfarben untereinander 16,56:1 (≥ 9:1, WCAG-Technik C40); dunkel gegen `#0369a1`/`#0ea5e9`/`#38bdf8` 2,79/5,98/7,73, weiß 5,93/2,77/2,14 → an jeder Stelle eine Farbe ≥ 3:1; auf hellen Flächen dunkel 14,81–16,56 |
| P11 | umgesetzt | 03 B5.2 (Zeile „Laden“ geteilt in „Erstes Laden“ und „Wechsel der Auswahl“, „gedimmt“ gestrichen) | – |
| P12 | umgesetzt | 04 Übersicht (Berührungspunkt Footer), Schritt 1 Aufgabe 3 (Nest-`/api/status` oder statischer Text, kein `lastFetch`), Schritt 2 (Frontend nur Datenzugriff, Footer-Prüfung wandert zum zweiten Merge) | Variante: erste (Footer-Anzeige im zweiten Merge), keine neue Abhängigkeit in der Übersicht |
| P13 | umgesetzt | 03 B4.8 (`FAKE_NOW` mit `refine`: nur development/test und nur mit `SCHEDULER_ENABLED=false`), B4.4 (`db:seed --fixture`), US01-6, US16-4/-5, US20-6 (Vorbedingungen); 04 Schritt 7 (Aufgabe, Browser-Prüfung), 12a und 12c (Vorbedingungen), A4 | Ergänzt: Das Frontend nimmt „heute“/„jetzt“ aus den API-Antworten, damit `FAKE_NOW` auch im Browser wirkt; Browser-Zeitzone über DevTools-Sensoren |
| P14 | umgesetzt | 04 Schritt 14 (`systemctl kill -s SIGKILL`); 03 C5 (`RestartSec=2`) | – |
| P15 | umgesetzt | 03 B1.3 neue Regel R32, B2.2 (Fehlercode `UPSTREAM_INVALID`), B4.2, C1 A08; 04 Schritt 3 (Aufgabe, Bezug, Unit-Test `{}` → `failed`), Schritt 4 (`zod` schon ab Schritt 3) | – |
| P16 | umgesetzt | 03 B4.8 (`THROTTLE_GLOBAL_LIMIT`, Standard 120 pro 60 s und IP), Abweichungstabelle, B3.2 (429), C1 A06, A4; 04 Schritt 11 (Aufgabe, Prüfung 121. Anfrage → 429), Schritt 14 (Lastmessung mit erhöhtem Limit) | Ergänzt, damit die autocannon-Messung in Schritt 14 nicht am neuen Limit scheitert |
| P17 | umgesetzt | 04 Schritt 0.2 (Express auf `127.0.0.1`, `cors()` entfernt, Prüfungen LAN-Zugriff und kein CORS-Header, Bezug) | – |
| P18 | umgesetzt | 04 Schritt 0.1 (`git config user.email` noreply, Prüfung, Bezug C2), Schritt 0.3 (Prüfungen `grep -c analytics` = 0 und `.vscode/mcp.json`) | – |
| P19 | umgesetzt | 04 Schritt 10 (nur Gast-Endpunkte laut 03 B4.7 mit `@Public()`, Prüfung `GET /api/imports` ohne Token → 401) | – |
| P20 | umgesetzt | 03 US09-3, US12-3, US13-7, US04-7, US10-6 (`2023-01-01..2026-01-01`), US12-2, US06-6, US08-3, Schreibweise in US03-3, US09-5, US13-6, US19-6, US20-5; B3.3 (Regel zur Schreibweise, eigene Feldcodes `to_before_from`, `range_too_long`, `missing_measurement`); 04 Schritt 10 (US09-3, US09-5) | – |
| P21 | umgesetzt | 04 Schritt 0.2 (Express stoppen, ‹ klicken → nur Fehlerbox), Schritt 1 (Hex-Suche auf `*.css`/`*.ts` beschränkt; Prüfung V21), Schritt 3 (Polling höchstens 30 s), Schritt 8 (Screenshots als Vergleichsstand), Schritt 9 (Screenshot-Vergleich), Schritt 11 (Test-Token per `JwtService.sign`) | Variante: Hex-Suche eingeschränkt (erste Variante). Abweichung: statt „Proxy 504“ steht „5xx (je nach Dev-Server 500, 502 oder 504)“, weil der Status vom Dev-Server abhängt; geprüft wird die Fehlerbox |
| P22 | umgesetzt | 02 E3.7.8 (Ladebalken in `--color-text`), E3.3 #44 (5,61 / 15,87) und #50 (Hero: 14,81 gegen `#1B1F24`, 2,64 gegen die Kante → dort 2 px Abstand) | Variante: `--color-text` (erste Variante); im Dunkelbereich zusätzlich der Abstand, weil `#F4F2EE` gegen `#E8772E` nur 2,64:1 hat |
| P23 | umgesetzt | 02 E3.3 #45–#49 (3,75; 3,79; 6,45/8,00; 8,59/9,20/7,87; 6,44), E3.2 Abschnitt 10 (Kommentar) und Regel unter der Basis | Variante: Regel „Fehler-, Erfolgsboxen und Formularfelder kommen in `.surface-dark` nicht vor“ (erste Variante) |
| P24 | umgesetzt | 03 Abschnitt 0 Z1, US15-5, R07 → B2.7; 02 V14 → E3.7.8, N07 → E3.7.7 | – |
| P25 | umgesetzt | 03 B4.1 (Knoten `NoticesModule`, Kanten `App --> Notices`, `Notices --> Fc`, `Status --> Stats`; Text; Verzeichnis `notices/`), B1.2 (Modultext), B6 „(B1.2)“ | – |
| P26 | umgesetzt | 03 B2.1 (status, health, notices, summaries/periods, corrections), B2.2 (Beispiele status, Jahresliste, periods, token, corrections; Abbildung `correction.field` camelCase ↔ snake_case), B2.3 (`NOTICE_THRESHOLD`), B2.6 (Zeile `notice_threshold`) | Beispiel für `summaries/periods` zusätzlich zum Vorschlag aufgenommen |
| P27 | umgesetzt | 03 B2.2 (`fetchedAt`/`basedOnFetchedAt` 13:05:12Z, Import 13:10Z, Korrektur 13:20Z, Login 13:08Z, `createdAt`/`assignedAt` 19.11. 09:00Z, Observation 16503 Version 3 mit 19,6 °C, Jahresminimum −13,9), US20-1, B3.3 (Zeitstempel des Fehlerbeispiels 13:19:41Z) | Variante: Jahresminimum auf −13,9 (erste Variante). Zusätzlich: Das Tagesbeispiel zeigt 16503 nach der Korrektur (`correctedAt` gesetzt), das Observation-Beispiel davor |
| P28 | umgesetzt | 03 B3.3 (`details`, Codes `CONFLICT`, `PAYLOAD_TOO_LARGE`, `CORRECTION_NOT_REVERSIBLE`), B3.1 (406 in allen Zeilen), B3.2 (409, 413), B4.3, R03, US10-7; 04 Schritt 5 (Aufgabe, Prüfungen `details.runningImportId`, 413) | `/api/docs` ist von der 406-Prüfung ausgenommen, weil die Swagger UI HTML liefert |
| P29 | umgesetzt | 03 B5.1 (Route `status`, `pages/status-page`), US17-5 (Link auf `/admin/importe`) | – |
| P30 | umgesetzt | 04 Schritt 8; 02 V21, E3.7.6, E3.9 („18 VON 30 TAGEN“, Rekorde „687 vollständige Tage (01.01.2025–18.11.2026)“ aus `daysCounted`) | – |
| P31 | umgesetzt | 03 B4.1 (`api/src/`), B2.7 Schritt 3 (`api/test/characterization/golden/`), B4.4 (`api/package.json`, `api/backups/`), Anhang; 04 A1 und Schritt 14 gekürzt | Verweise auf den Altbestand (`backend/data/`, `backend/src/*.ts` des Express-Servers) bleiben |
| P32 | umgesetzt | 03 Abschnitt 0 (Z1–Z4 mit Erklärung), US08, B2.5, B2.7, C7 Nr. 10, Annahme A1, Anhang; 04 Schritt 9 | – |
| P33 | umgesetzt | 02 Fragen 3, 6, 8 („beantwortet durch E2.2“), N03 (Verweis auf 03 R16: 3–500 Zeichen, 6 Felder); 03 B3.7 („US01 … US20“) | Variante: 02 auf 03 R16 verwiesen (erste Variante), keine Eingrenzung auf Temperatur und Niederschlag |
| P34 | umgesetzt | 03 B1.1 (Spalte „Darf nicht“ mit Begründung, Lücken und Korrekturübersicht ergänzt, **A:** Bestätigung durch den Auftraggeber) | Zusätzlich 02 E3.9 „Neu: Status“ angeglichen: keine Lückentabelle für Gäste (passt zu 03 US17-4) |
| P35 | umgesetzt | 04 A4 (alle Übergangsvariablen, dazu `FAKE_NOW`), Schritt 5 Bezug (US04-6 gestrichen), Schritt 8 Bezug und Prüfung US04-6, Matrix US03 → „2, 4, 7“, US04 → „5 (Muster), 8“ | – |
| P36 | umgesetzt | 03 US06-7 (`corrected` an `hottest`/`coldest`, Chip „KORRIGIERT“), B2.2 records, B5.1 stats-page, US19-9; 04 Schritt 12a (US06-7), 12b (US19-9), Matrix US06 | – |
| P37 | umgesetzt | 03 R27 Spalte „Ort“ (`dryDays` und `precipitationDays` aus derselben Tagesliste) | – |

**Zählung:** 37 umgesetzt, 0 teilweise, 0 nicht umgesetzt.
