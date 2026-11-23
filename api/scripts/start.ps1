<#
.SYNOPSIS
  Startet das Backend des Wetter-Dashboards (Nest) auf diesem PC: bauen, Datenbank sichern, starten.

.DESCRIPTION
  Schritt 14c (Betrieb auf dem Entwicklungsrechner, kein Autostart). Ablauf im Ordner api/:
    1. npm run build
    2. node dist/database/db-cli.js backup   (wie npm run db:backup, ohne zweiten Build)
    3. node dist/main.js                     (Nest mit Scheduler laut api/.env, beenden mit Strg+C)
  Die Werte (DB_PATH, JWT_SECRET, SCHEDULER_ENABLED, BACKUP_DIR, BACKUP_KEEP ...) kommen aus api/.env bzw.
  der Umgebung. Schlaegt Build oder Sicherung fehl, startet Nest nicht (Exit-Code ungleich 0).
  Das Skript aendert nichts am System (keine Aufgabenplanung, kein Dienst, keine Registry).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
  (im Ordner api/; mit ExecutionPolicy RemoteSigned reicht .\scripts\start.ps1)
#>
# Kein globales ErrorActionPreference = 'Stop': In Windows PowerShell 5.1 koennte sonst eine Zeile von Nest auf
# stderr (z. B. ein Fehler-Log) das Skript abbrechen. Die Exit-Codes werden nach jedem Schritt selbst geprueft.
$api = Split-Path -Parent $PSScriptRoot
$code = 0
Push-Location $api -ErrorAction Stop
try {
  Write-Host '[1/3] Bauen: npm run build'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build fehlgeschlagen (Exit-Code $LASTEXITCODE). Nest wird nicht gestartet." }

  Write-Host '[2/3] Sicherung: db:backup'
  node dist/database/db-cli.js backup
  if ($LASTEXITCODE -ne 0) {
    throw "Sicherung fehlgeschlagen (Exit-Code $LASTEXITCODE). Nest wird nicht gestartet. Ohne Sicherung starten: npm run start:prod"
  }

  Write-Host '[3/3] Nest starten: node dist/main.js (beenden mit Strg+C)'
  node dist/main.js
  $code = $LASTEXITCODE
}
catch {
  Write-Host "Abbruch: $($_.Exception.Message)" -ForegroundColor Red
  $code = 1
}
finally {
  Pop-Location
}
exit $code
