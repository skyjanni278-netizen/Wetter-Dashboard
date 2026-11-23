/** R25: `never` ohne erfolgreichen Import, `ok` bis 2 h danach, sonst `delayed`. */
export type UpdateState = 'never' | 'ok' | 'delayed';

/**
 * Datenstand nach B2.2 (öffentlich), ohne Fehlertext (US07-1, US17-1): kein Feld `error`, `message` oder
 * `reason`. Seit Schritt 12a mit `nextScheduledUpdateAt` (N01) und den Kennzahlen aus R26 (N04).
 */
export interface Status {
  locationId: number;
  today: string;
  timezone: string;
  dataFrom: string | null;
  dataTo: string | null;
  lastSuccessfulUpdateAt: string | null;
  /** Nächster Lauf des stündlichen Abrufs (UTC); `null`, wenn der Scheduler aus ist (US16-3). */
  nextScheduledUpdateAt: string | null;
  updateState: UpdateState;
  /** Berliner Tage mit mindestens einer Stunde, von `dataFrom` bis heute (US17-1). */
  daysWithData: number;
  /** Vollständige Tage nach R13 in diesem Zeitraum (US17-1). */
  daysComplete: number;
  /** R26: zusammenhängende Lücken von `dataFrom` bis heute, gleich der Länge von `GET /api/gaps` (US17-2). */
  gapCount: number;
}
