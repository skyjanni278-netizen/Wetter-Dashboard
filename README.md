# Wetter-Dashboard Heubach

Lokales Wetter-Dashboard für die Stadt **Heubach im Ostalbkreis (Baden-Württemberg)**.  
Stündlicher Datenabruf von der kostenlosen [Open-Meteo API](https://open-meteo.com), Speicherung als JSON-Dateien und Darstellung im Browser mit interaktiven Klimadiagrammen.

---

## Übersicht

| | |
|---|---|
| **Standort** | Heubach, Ostalbkreis — 48.7936°N, 9.9369°E |
| **Datenquelle** | Open-Meteo API (kostenlos, kein API-Key erforderlich) |
| **Datenspeicherung** | JSON-Dateien (`backend/data/YYYY-MM/YYYY-MM-DD.json`) |
| **Aktualisierung** | Automatisch jede volle Stunde via Cron-Job |
| **Frontend-Port** | 4200 (Entwicklung) |
| **Backend-Port** | 3000 |

---

## Features

- **Tagesansicht** — Aktuelles Wetter mit Temperatur, Gefühlter Temperatur, Windgeschwindigkeit und -richtung sowie Wetter-Icon. Für vergangene Tage: Höchst-/Tiefsttemperatur und Gesamtniederschlag
- **7-Tage-Vorschau** — Tagesstreifen mit Wetter-Icon, Max-/Min-Temperatur und Niederschlag
- **Klimadiagramm (Tagesverlauf)** — Stündliche Temperatur (Linie) und Niederschlag (Balken) in einem kombinierten Diagramm
- **Monatsübersicht** — Tägliche Durchschnittstemperaturen und Gesamtniederschlag für jeden Tag des Monats
- **Jahresübersicht** — Monatliche Durchschnittswerte für das gesamte Jahr
- **Rekorde & Statistiken** — Heißester Tag, kältester Tag, regenreichster Tag, längste Trockenperiode

---

## Technologien

### Backend
| Paket | Zweck |
|---|---|
| Node.js + TypeScript | Laufzeitumgebung |
| Express | REST-API-Server |
| node-cron | Stündlicher Scheduler |
| axios | HTTP-Requests zur Open-Meteo API |
| helmet | HTTP-Sicherheitsheader |
| cors | Cross-Origin-Anfragen erlauben |

### Frontend
| Paket | Zweck |
|---|---|
| Angular 21 | Framework (Standalone Components, Signals) |
| Chart.js | Klimadiagramme (Dual-Achsen, Bar + Line) |
| Angular Router | Lazy Loading der 4 Seiten |

---

## Projektstruktur

```
Wetter-Dashboard/
├── backend/
│   ├── src/
│   │   ├── server.ts         # Express-Server + REST-Endpunkte
│   │   ├── scheduler.ts      # Stündlicher Cron-Job (Datenabruf)
│   │   ├── weather-api.ts    # Open-Meteo API-Integration
│   │   ├── data-store.ts     # JSON-Dateien lesen/schreiben + Aggregation
│   │   └── seed-data.ts      # Testdaten generieren
│   ├── data/                 # Gespeicherte Wetterdaten (auto-generiert)
│   │   └── YYYY-MM/
│   │       └── YYYY-MM-DD.json
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    └── src/
        └── app/
            ├── pages/
            │   ├── today-page/       # Tagesansicht (/)
            │   ├── monthly-page/     # Monatsdiagramm (/monat)
            │   ├── yearly-page/      # Jahresdiagramm (/jahr)
            │   └── stats-page/       # Rekorde (/statistiken)
            ├── components/
            │   └── climate-chart/    # Wiederverwendbare Chart.js-Komponente
            ├── services/
            │   └── weather.service.ts
            ├── models/
            │   └── weather.ts        # TypeScript-Interfaces
            └── utils/
                └── weather-icon.ts   # WMO-Code → Emoji + Beschreibung
```

---

## Installation & Start

### Voraussetzungen
- Node.js 20+
- npm 9+

### 1. Repository klonen
```bash
git clone https://github.com/skyjanni278-netizen/Wetter-Dashboard.git
cd Wetter-Dashboard
```

### 2. Backend starten
```bash
cd backend
npm install
npm run dev
```
Der Server startet auf `http://localhost:3000` und ruft beim Start sofort die ersten Wetterdaten ab.

### 3. Frontend starten
```bash
cd frontend
npm install
npm start
```
Das Dashboard ist erreichbar unter `http://localhost:4200`.

> Beim ersten Start dauert es einen kurzen Moment, bis der Scheduler die Daten von Open-Meteo geladen und gespeichert hat.

### Testdaten generieren (optional)
Falls Verlaufsdaten für Tests benötigt werden:
```bash
cd backend
npx ts-node src/seed-data.ts
```

---

## REST-API

Alle Endpunkte sind unter `http://localhost:3000` erreichbar.

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/status` | Letzter Abruf, Status, gespeicherte Tage |
| `GET` | `/api/data/today` | Heutiger Tag (stündliche Einträge) |
| `GET` | `/api/data/day/:date` | Beliebiger Tag im Format `YYYY-MM-DD` |
| `GET` | `/api/data/month/:year/:month` | Monatsdurchschnitte (z.B. `/2026/05`) |
| `GET` | `/api/data/year/:year` | Jahresdurchschnitte (z.B. `/2026`) |
| `GET` | `/api/forecast` | 7-Tage-Vorschau (aus gespeicherter Datei) |
| `GET` | `/api/stats` | Rekorde und Statistiken |

### Beispiel: Tagesformat (`YYYY-MM-DD.json`)
```json
{
  "date": "2026-05-07",
  "location": "Heubach",
  "hourly": [
    {
      "time": "2026-05-07T00:00",
      "temperature": 11.2,
      "apparentTemperature": 9.4,
      "precipitation": 0.0,
      "weathercode": 0,
      "windspeed": 8.3,
      "winddirection": 215
    }
  ]
}
```

---

## Datenarchitektur

```
Open-Meteo API
      │
      │  1× pro Stunde (Cron-Job)
      ▼
  scheduler.ts
  ├── fetchTodayData()  →  data/YYYY-MM/YYYY-MM-DD.json
  └── fetchForecast()   →  data/forecast.json
      │
      │  bei Seitenaufruf (nur Datei lesen)
      ▼
  server.ts (REST-API)
      │
      │  via /api (Proxy)
      ▼
  Angular Frontend
```

Die API ruft Open-Meteo **niemals** direkt bei einem Seitenaufruf auf — alle Daten kommen aus gespeicherten Dateien.

---

## Produktivbetrieb

Für den dauerhaften Betrieb (z.B. Raspberry Pi oder Server) empfiehlt sich [PM2](https://pm2.keymaster.io/):

```bash
cd backend
npm run build
pm2 start dist/server.js --name wetter-backend

cd ../frontend
npm run build
# Statische Dateien aus dist/frontend/ via Nginx oder einem anderen Webserver ausliefern
```

Den Backend-Port kann man über die Umgebungsvariable `PORT` steuern:
```bash
PORT=8080 node dist/server.js
```

---

## Datenquelle & Attribution

Wetterdaten bereitgestellt von [Open-Meteo](https://open-meteo.com) — kostenlos und ohne API-Key nutzbar.  
Koordinaten Heubach: 48.7936°N, 9.9369°E, Zeitzone: Europe/Berlin.
