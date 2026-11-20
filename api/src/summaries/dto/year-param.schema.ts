import { z } from 'zod';

/** Beginn des Open-Meteo-Archivs (R05, A). */
export const FIRST_YEAR = 1940;

/** R05: Jahr `YYYY`, mindestens 1940 (`1939`, `26`, `abc` ungültig). Ausgabe `number`. */
export const YearSchema = z
  .string({ error: 'Bitte ein Jahr im Format JJJJ angeben.' })
  .regex(/^\d{4}$/, { error: 'Bitte ein Jahr im Format JJJJ angeben.' })
  .transform(Number)
  .pipe(z.number().int().min(FIRST_YEAR, { error: `Daten gibt es frühestens ab ${FIRST_YEAR}.` }));

/**
 * `GET /api/summaries/years/:year` (Endpunkt ab Schritt 8). Jahr nach dem laufenden →
 * `DATE_IN_FUTURE` und Jahr ohne Daten → 404 prüft der Service (R05).
 */
export const YearParamSchema = z.object({ year: YearSchema }).strict();

export type YearParam = z.infer<typeof YearParamSchema>;
