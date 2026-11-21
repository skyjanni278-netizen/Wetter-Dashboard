/** Antwort von `GET /api/health` (US14-3): Betriebsprüfung, kein Nutzer. */
export interface Health {
  status: 'ok';
  database: 'ok';
}
