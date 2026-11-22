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

---

## Aufbau

```
Wetter-Dashboard/
├── api/                  # NestJS-API + SQLite (src/, test/)
├── frontend/             # Angular-App (Seiten Heute, Monat, Jahr, Rekorde)
├── backend/data/         # nur Altbestand (JSON), Quelle für den Altdatenimport
└── docs/                 # PROJEKTDOKU.md, Planung (umbau/), Postman (api/)
```

`backend/data/` ist nur noch Altbestand bzw. Archiv (nicht im Git). Der frühere Express-Server ist entfernt.

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
| `npm run db:seed [-- --fixture <name>]` | Dev-Daten bzw. Fixture einspielen (ersetzt alle Daten der DB) |
| `npm run db:reset` | DB neu aufbauen; verweigert sich bei `NODE_ENV=production` und bei gesammelten Daten (Importe `legacy`/`scheduled`), außer mit `-- --force-delete-collected-data`; sichert vorher per `VACUUM INTO` |
| `npm run cli -- import:legacy --dir <pfad> [--dry-run]` | Altbestand (JSON) in die DB übernehmen; `--dry-run` prüft nur. Kopien des Ordners nur mit erhaltenen Dateizeitstempeln anlegen |
| `npm run cli -- legacy:dst-check --dir <pfad>` | DST-Stichprobe gegen Open-Meteo (Zeitregel des Altbestands) |
| `npm test` / `npm run test:e2e` | Unit- bzw. e2e-Tests |

Im Ordner `frontend/`: `npm test -- --watch=false`, `npm run lint:css`, `npm run build`.

---

## REST-API

Alle Endpunkte liegen unter `http://localhost:3000/api` (Frontend: über den Proxy unter `/api`). Ressourcen: `locations`, `status`, `health`, `days`, `forecasts`, `summaries`, `records`, `imports`, `gaps`. Fehler haben ein einheitliches JSON-Format.

Die Endpunkte `/imports*`, `/gaps` und `/auth/me` verlangen ein Token mit der Rolle `admin` (Anmeldung: `POST /auth/tokens`).

Die vollständige, maschinenlesbare Beschreibung (OpenAPI, Swagger UI) steht bei `SWAGGER_ENABLED=true` unter `http://localhost:3000/api/docs`. Die Tabelle aller Endpunkte, Antwortformate und Regeln steht in [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md). Eine Postman-Collection liegt unter `docs/api/`.

---

## Datenquelle & Attribution

Wetterdaten bereitgestellt von [Open-Meteo](https://open-meteo.com) — kostenlos und ohne API-Key nutzbar.
Koordinaten Heubach: 48.7936°N, 9.9369°E, Zeitzone: Europe/Berlin.
