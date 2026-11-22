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
| **Aktualisierung** | stündlich durch den Scheduler, nur mit `SCHEDULER_ENABLED=true` |

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

```bash
cd api
npm install
npm run migration:run     # Datenbank anlegen bzw. aktualisieren
npm run db:seed           # optional: Testdaten in die Dev-DB
npm start
```

Ohne `DB_PATH` arbeitet Nest auf der **Dev-DB** `%LOCALAPPDATA%\wetter-heubach\weather.dev.db`, ohne Scheduler (`SCHEDULER_ENABLED` ist standardmäßig aus).

**Mit der Sammel-DB und Scheduler** (echte Daten, stündlicher Abruf):

```bash
cd api
npm run build
# Windows (cmd):
set DB_PATH=%LOCALAPPDATA%\wetter-heubach\weather.db
set SCHEDULER_ENABLED=true
node dist/main.js
```

Weitere Variablen: `PORT` (Standard 3000), `SWAGGER_ENABLED=true` (OpenAPI-Doku), `FAKE_NOW` (feste Uhr für Prüfungen, nicht mit Scheduler). Alle Variablen: PROJEKTDOKU 3a.5.

### Frontend (Port 4200)

```bash
cd frontend
npm install
npm start                 # ng serve, leitet /api an http://localhost:3000
```

Das Dashboard ist erreichbar unter `http://localhost:4200`. Nest muss laufen.

---

## Wichtige Skripte (in `api/`)

| Befehl | Wirkung |
|---|---|
| `npm run migration:run` | Migrationen gegen `DB_PATH` ausführen |
| `npm run db:seed [-- --fixture <name>]` | Dev-Daten bzw. Fixture einspielen (ersetzt alle Daten der DB) |
| `npm run db:reset` | DB neu aufbauen; verweigert sich bei `NODE_ENV=production` und bei gesammelten Daten (Importe `legacy`/`scheduled`), außer mit `-- --force-delete-collected-data`; sichert vorher per `VACUUM INTO` |
| `npm run cli -- import:legacy --dir <pfad> [--dry-run]` | Altbestand (JSON) in die DB übernehmen; `--dry-run` prüft nur. Kopien des Ordners nur mit erhaltenen Dateizeitstempeln anlegen |
| `npm run cli -- legacy:dst-check --dir <pfad>` | DST-Stichprobe gegen Open-Meteo (Zeitregel des Altbestands) |
| `npm test` / `npm run test:e2e` | Unit- bzw. e2e-Tests |

Im Ordner `frontend/`: `npm test -- --watch=false`, `npm run lint:css`, `npm run build`.

---

## REST-API

Alle Endpunkte liegen unter `http://localhost:3000/api` (Frontend: über den Proxy unter `/api`). Ressourcen: `locations`, `status`, `health`, `days`, `forecasts`, `summaries`, `records`, `imports`, `gaps`. Fehler haben ein einheitliches JSON-Format.

Die vollständige, maschinenlesbare Beschreibung (OpenAPI, Swagger UI) steht bei `SWAGGER_ENABLED=true` unter `http://localhost:3000/api/docs`. Die Tabelle aller Endpunkte, Antwortformate und Regeln steht in [`docs/PROJEKTDOKU.md`](docs/PROJEKTDOKU.md). Eine Postman-Collection liegt unter `docs/api/`.

---

## Datenquelle & Attribution

Wetterdaten bereitgestellt von [Open-Meteo](https://open-meteo.com) — kostenlos und ohne API-Key nutzbar.
Koordinaten Heubach: 48.7936°N, 9.9369°E, Zeitzone: Europe/Berlin.
