# Wetter-Dashboard Heubach

> **Aktuelle Projektdokumentation** (Aufbau, Routen, Komponenten, Endpunkte, Befehle, Änderungsprotokoll): [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md). Die Planung des Umbaus steht unter [`docs/umbau/`](docs/umbau/).

Lokales Wetter-Dashboard für die Stadt **Heubach im Ostalbkreis (Baden-Württemberg)**.
Stündlicher Datenabruf von der kostenlosen [Open-Meteo API](https://open-meteo.com), Speicherung in SQLite und Darstellung im Browser mit interaktiven Klimadiagrammen.

---

## Übersicht

| | |
|---|---|
| **Standort** | Heubach, Ostalbkreis — 48.7936°N, 9.9369°E |
| **Datenquelle** | Open-Meteo API (kostenlos, kein API-Key erforderlich) |
| **Backend** | `api/`: NestJS mit SQLite (TypeORM), Port 3000, nur `127.0.0.1` |
| **Frontend** | `frontend/`: Angular 21, Port 4200 (Entwicklung), Proxy `/api` → `http://localhost:3000` |
| **Aktualisierung** | stündlich durch den Scheduler, Standard an (`SCHEDULER_ENABLED=true`), für die Dev-DB aus |
| **Betrieb** | auf dem eigenen Windows-PC, von Hand gestartet. **Kein Raspberry Pi**, kein Autostart, kein Reverse Proxy (siehe „Betrieb und Backup“) |

---

## Aufbau

```
Wetter-Dashboard/
├── api/                  # NestJS-API + SQLite (src/, test/, scripts/start.ps1)
├── frontend/             # Angular-App (Heute, Monat, Jahr, Rekorde, Datenstand, Admin)
├── backend/data/         # nur Altbestand (JSON), Quelle für den Altdatenimport
└── docs/                 # PROJEKTDOKU.md, Planung (umbau/), Postman (api/)
```

`backend/data/` ist nur noch Altbestand bzw. Archiv (nicht im Git). Der frühere Express-Server ist entfernt.

---

## Architektur: bewusst nicht eingesetzt

| Thema | Entscheidung | Begründung |
|---|---|---|
| WebSockets / SSE | entfällt | Live-Aktualisierung (N09) ist abgelehnt. Bei unter 0,05 Anfragen pro Sekunde reichen das Polling des Import-Status (alle 2 s) und die Anzeige „Stand: …“ |
| Templates (Handlebars) | entfällt | Die API liefert nur JSON (andere `Accept`-Header → 406). Die Oberfläche ist allein die Angular-App |
| Events (`@nestjs/event-emitter`) | entfällt | Kein fachlicher Bedarf. Nach einem Import wird der Cache über die Datenrevision ungültig; Status, Lücken und Hinweise werden beim Lesen berechnet. Ein Event-Bus würde den Ablauf nur schwerer nachvollziehbar machen (Entscheidung vom 23.11.2026, Roadmap-Schritt 13) |

---

## Voraussetzungen

- Node.js 20+ (getestet mit Node 24)
- npm 9+

```bash
git clone https://github.com/skyjanni278-netizen/Wetter-Dashboard.git
cd Wetter-Dashboard
```

---

## Start

### Nest-API (Port 3000)

Die Konfiguration steht in `api/.env` (Vorlage `api/.env.example`, die echte `.env` ist nicht im Git). Umgebungsvariablen haben Vorrang vor der Datei. Ohne gültige Werte startet nichts (Exit-Code 1 mit Feldnamen).

```bash
cd api
npm install
copy .env.example .env    # Windows (cmd); in Git Bash: cp .env.example .env
```

Dann in `api/.env` anpassen:

| Variable | Bedeutung |
|---|---|
| `NODE_ENV` | Pflicht: `development`, `test` oder `production` |
| `DB_PATH` | Pflicht: SQLite-Datei, **voller Pfad** (`%LOCALAPPDATA%` wird in der `.env` nicht ersetzt; anzeigen mit `echo %LOCALAPPDATA%`) |
| `JWT_SECRET` | Pflicht für Nest, mindestens 32 Zeichen: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `SCHEDULER_ENABLED` | stündlicher Abruf; Standard `true`, für die Dev-DB `false` |

Alle weiteren Variablen (Port, Swagger, Limits, `FAKE_NOW` ...) stehen kommentiert in `api/.env.example` und in PROJEKTDOKU 3a.5.

**Dev-DB** (Testdaten, ohne Scheduler): `DB_PATH=<voller Pfad>\wetter-heubach\weather.dev.db` und `SCHEDULER_ENABLED=false`.

```bash
npm run migration:run     # Datenbank anlegen bzw. aktualisieren
npm run db:seed           # Testdaten und Dev-Admin (DEV_ADMIN_PASSWORD, mindestens 12 Zeichen)
npm start
```

**Sammel-DB** (echte Daten, stündlicher Abruf): `DB_PATH=<voller Pfad>\wetter-heubach\weather.db` und `SCHEDULER_ENABLED=true`. Einmalig einrichten:

```bash
npm run migration:run
set ADMIN_INITIAL_PASSWORD=<mindestens 12 Zeichen>    # danach wieder entfernen
npm run cli -- admin:create --username admin
npm run build
node dist/main.js
```

Ohne `ADMIN_INITIAL_PASSWORD` fragt `admin:create` das Passwort verdeckt ab.

**Limits:** global 120 Anfragen je 60 s und IP, die Anmeldung zusätzlich 5 Versuche je 60 s (Antwort 429 mit `Retry-After`). Die Antworten tragen Sicherheits-Header (Helmet), CORS ist aus.

### Frontend (Port 4200)

```bash
cd frontend
npm install
npm start                 # ng serve, leitet /api an http://localhost:3000
```

Das Dashboard ist erreichbar unter `http://localhost:4200`. Nest muss laufen. Die Anmeldung des Admins steht unter `/admin/anmeldung`.

---

## Wichtige Skripte (in `api/`)

| Befehl | Wirkung |
|---|---|
| `npm run migration:run` | Migrationen gegen `DB_PATH` ausführen |
| `npm run cli -- admin:create --username <name>` | ersten Admin anlegen (Passwort aus `ADMIN_INITIAL_PASSWORD` oder Abfrage) |
| `npm run cli -- admin:set-password --username <name>` | Passwort eines Admins ändern (verdeckte Abfrage) |
| `npm run db:seed [-- --fixture <name>]` | Dev-Daten bzw. Fixture einspielen (ersetzt alle Daten der DB) |
| `npm run db:reset` | DB neu aufbauen; verweigert sich bei `NODE_ENV=production` und bei gesammelten Daten (Importe `legacy`/`scheduled`), außer mit `-- --force-delete-collected-data`; sichert vorher per `VACUUM INTO` |
| `npm run db:backup` | `DB_PATH` sichern (`VACUUM INTO`, auch bei laufendem Nest) nach `BACKUP_DIR`, prüfen, die neuesten `BACKUP_KEEP` (14) behalten |
| `npm run db:restore -- --from <datei> --yes` | Sicherung zurückspielen (Nest vorher stoppen); sichert vorher den aktuellen Stand, ohne `--yes` nur Prüfung und Warnung |
| `npm run cli -- import:legacy --dir <pfad> [--dry-run]` | Altbestand (JSON) in die DB übernehmen; `--dry-run` prüft nur. Kopien des Ordners nur mit erhaltenen Dateizeitstempeln anlegen |
| `npm run cli -- legacy:dst-check --dir <pfad>` | DST-Stichprobe gegen Open-Meteo (Zeitregel des Altbestands) |
| `npm test` / `npm run test:e2e` | Unit- bzw. e2e-Tests (siehe „Tests“) |
| `npm run build` / `npm start` / `npm run start:dev` / `npm run start:prod` | Nest bauen bzw. starten (`start:dev` mit Watch, `start:prod` aus dem Build) |

Im Ordner `frontend/`: `npm start`, `npm test -- --watch=false`, `npm run lint:css`, `npm run build`.

---

## Betrieb und Backup

Das Dashboard läuft auf dem eigenen Windows-PC (kein Raspberry Pi, kein Autostart): Nest wird von Hand gestartet und gestoppt.

```powershell
cd api
powershell -ExecutionPolicy Bypass -File scripts\start.ps1   # baut, sichert die DB (db:backup), startet Nest; Stopp mit Strg+C
```

- **Sicherungen** liegen standardmäßig in `%LOCALAPPDATA%\wetter-heubach\backups\weather-<UTC-Zeit>.db`; die neuesten 14 bleiben (`BACKUP_DIR`, `BACKUP_KEEP` in `api/.env`). Ab und zu die neueste Sicherung auf einen anderen Datenträger kopieren.
- **Wiederherstellen:** Nest stoppen, dann `npm run db:restore -- --from <datei> --yes`.
- **PC war aus:** Der Scheduler holt nach dem Start gestern und heute nach; längere Lücken als Admin unter `/admin/luecken` mit „Nachladen“ schließen.

Einzelheiten (Start und Stopp, Backup-Routine, Wiederherstellung Schritt für Schritt, Wiederherstellungstest): [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md), Abschnitt 7a.

---

## Tests

| Was | Befehl | Stand (Schritt 14) |
|---|---|---|
| API, Unit | `cd api && npm test` | 764 Tests in 68 Suites |
| API, e2e (SQLite `:memory:`, kein Aufruf von Open-Meteo) | `cd api && npm run test:e2e` | 242 Tests in 12 Suites |
| Frontend (Vitest, jsdom) | `cd frontend && npm test -- --watch=false` | 666 Tests in 48 Dateien |
| CSS (stylelint) | `cd frontend && npm run lint:css` | – |
| API-Tests je Akzeptanzkriterium | newman, siehe „Postman“ | 109 Requests, 283 Assertions |

Die Tests lesen keine `api/.env` und brauchen weder Nest noch die Sammel-DB. Der erste Frontend-Lauf kann wegen jsdom länger dauern; bei einem Worker-Timeout den Lauf wiederholen (`maxWorkers: 2` ist Absicht). Barrierefreiheit (axe, Tastatur) wurde je Route im Browser geprüft (Schritt 14b), nicht in den Specs. Einzelheiten: [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md), Abschnitt 6.

---

## REST-API

Alle Endpunkte liegen unter `http://localhost:3000/api` (Frontend: über den Proxy unter `/api`). Ressourcen: `locations`, `status`, `health`, `days`, `forecasts`, `summaries`, `records`, `imports`, `gaps`. Fehler haben ein einheitliches JSON-Format.

Die Endpunkte `/imports*`, `/gaps` und `/auth/me` verlangen ein Token mit der Rolle `admin` (Anmeldung: `POST /auth/tokens`).

Die vollständige, maschinenlesbare Beschreibung (OpenAPI, Swagger UI) steht bei `SWAGGER_ENABLED=true` unter `http://localhost:3000/api/docs`. Die Tabelle aller Endpunkte, Antwortformate und Regeln steht in [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md). Eine Postman-Collection liegt unter `docs/api/`.

### Postman und newman

Die Collection `docs/api/wetter-heubach.postman_collection.json` mit der Umgebung `docs/api/local.postman_environment.json` testet jedes Akzeptanzkriterium. Sie braucht einen **eigenen** Nest auf einer eigenen Temp-DB (nicht auf der Sammel-DB) mit `FAKE_NOW`, `SCHEDULER_ENABLED=false` und importiertem Altbestand; die genaue Vorbereitung steht in der Beschreibung der Collection (in Postman unter „Collection → Beschreibung“, in der Datei unter `info.description`). Lauf (frisch gestarteter Nest, wegen der Limits nur einmal hintereinander):

```bash
npx newman run docs/api/wetter-heubach.postman_collection.json -e docs/api/local.postman_environment.json   --env-var baseUrl=http://localhost:3002/api --env-var adminPassword=<Passwort> --env-var jwtSecret=<JWT_SECRET des Nest>
```

`newman` ist keine Abhängigkeit des Projekts; `npx` lädt es bei Bedarf.

---

## Datenquelle & Attribution

Wetterdaten bereitgestellt von [Open-Meteo](https://open-meteo.com) — kostenlos und ohne API-Key nutzbar.
Koordinaten Heubach: 48.7936°N, 9.9369°E, Zeitzone: Europe/Berlin.
