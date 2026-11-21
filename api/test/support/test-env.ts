/**
 * Läuft vor jeder Testdatei (Jest `setupFiles`, Unit und e2e). Tests berühren nie eine echte Datenbank:
 * `DB_PATH` ist immer `:memory:` (03 B4.4), auch wenn die Shell auf die Dev- oder Sammel-DB zeigt. Dort laufen
 * die Migrationen beim Verbinden (`database-options.ts`). Ein Test mit Datei-DB setzt den Pfad per
 * `overrideProvider(DB_PATH)` auf eine Datei im Temp-Ordner.
 */
process.env['DB_PATH'] = ':memory:';
