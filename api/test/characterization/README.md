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

## Frontend-Tests auf der USB-Platte

`cd frontend && npm test -- --watch=false` lädt jsdom auf Laufwerk D: (USB, FAT32) in etwa 130 s. Der erste Lauf kann deshalb mit `Timeout waiting for worker to respond` abbrechen. Dann einfach erneut ausführen: Ab dem zweiten Lauf sind die Dateien im Cache und der Test läuft durch.
