/**
 * Läuft vor jeder Testdatei (Jest `setupFiles`, Unit und e2e). Tests berühren nie eine echte Datenbank:
 * `DB_PATH` ist immer `:memory:` (03 B4.4), auch wenn die Shell auf die Dev- oder Sammel-DB zeigt. Dort laufen
 * die Migrationen beim Verbinden (`database-options.ts`). Ein Test mit Datei-DB setzt den Pfad per
 * `overrideProvider(DB_PATH)` auf eine Datei im Temp-Ordner.
 *
 * Schritt 10: festes `JWT_SECRET` nur für Tests (Pflicht, mindestens 32 Zeichen) und Standardlaufzeit; Passwörter
 * aus der Shell (`DEV_ADMIN_PASSWORD`, `ADMIN_INITIAL_PASSWORD`) wirken nie in Tests.
 */
process.env['DB_PATH'] = ':memory:';
process.env['JWT_SECRET'] = 'test-secret-nur-fuer-jest-mindestens-32-zeichen';
delete process.env['JWT_EXPIRES_IN'];
delete process.env['DEV_ADMIN_PASSWORD'];
delete process.env['ADMIN_INITIAL_PASSWORD'];
