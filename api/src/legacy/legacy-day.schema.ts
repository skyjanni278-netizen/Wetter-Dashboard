import { z } from 'zod';
import { IsoDateSchema } from '../common/dto/iso-date.schema';

/**
 * Format der Altdateien von Express (`backend/data/YYYY-MM/YYYY-MM-DD.json`, 03 Z4, B2.7 Schritt 4).
 * Streng (`.strict()`): Seed-Dateien des früheren `backend/src/seed-data.ts` (F16, seit 9b gelöscht) haben
 * weniger Felder und fallen hier auf.
 * Zahlen sind `.nullable()` (R14: `null` bleibt `null`, nie 0). Wertebereiche wie R16 und die DB-`CHECK`s;
 * der Wettercode wird hier nur als ganze Zahl geprüft, ein unbekannter Code wird beim Import `null` mit
 * Warnung (B2.7 Schritt 7).
 */
const range = (min: number, max: number) => z.number().min(min).max(max).nullable();

/** Ortszeit ohne Offset, volle Stunde (`2025-07-15T14:00`). */
export const LEGACY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;

/** Stunden je Datei: Express schreibt immer 24 Ortszeiten, auch an DST-Tagen (Z1). */
export const LEGACY_HOURS_PER_FILE = 24;

export const LegacyHourSchema = z
  .object({
    time: z.string().regex(LEGACY_TIME, { error: 'time nicht im Format YYYY-MM-DDTHH:00' }),
    temperature: range(-50, 50),
    apparentTemperature: range(-70, 60),
    precipitation: range(0, 200),
    weathercode: z.number().int().min(0).nullable(),
    windspeed: range(0, 300),
    winddirection: range(0, 360),
  })
  .strict();

export const LegacyDaySchema = z
  .object({
    date: IsoDateSchema,
    location: z.literal('Heubach'),
    hourly: z.array(LegacyHourSchema).length(LEGACY_HOURS_PER_FILE),
  })
  .strict()
  .superRefine((day, ctx) => {
    const seen = new Set<string>();
    day.hourly.forEach((hour, index) => {
      if (!hour.time.startsWith(`${day.date}T`)) {
        ctx.addIssue({ code: 'custom', path: ['hourly', index, 'time'], message: `${hour.time} gehört nicht zum ${day.date}` });
      }
      if (seen.has(hour.time)) {
        ctx.addIssue({ code: 'custom', path: ['hourly', index, 'time'], message: `${hour.time} doppelt` });
      }
      seen.add(hour.time);
    });
  });

export type LegacyDay = z.infer<typeof LegacyDaySchema>;
export type LegacyHour = LegacyDay['hourly'][number];

/** `forecast.json`: Liste der Vorhersagetage (Berliner Kalendertage). */
export const LegacyForecastSchema = z.array(
  z
    .object({
      date: IsoDateSchema,
      maxTemp: range(-50, 50),
      minTemp: range(-50, 50),
      precipitation: z.number().min(0).nullable(),
      weathercode: z.number().int().min(0).nullable(),
    })
    .strict()
    .refine(day => day.minTemp === null || day.maxTemp === null || day.minTemp <= day.maxTemp, {
      error: 'minTemp größer als maxTemp',
      path: ['minTemp'],
    }),
);

export type LegacyForecastDay = z.infer<typeof LegacyForecastSchema>[number];

/** Erste Probleme eines Zod-Fehlers als kurzer Text (`hourly.3.windspeed: …`). */
export function describeLegacyIssues(error: z.ZodError, limit = 3): string {
  const issues = error.issues.slice(0, limit).map(issue => `${issue.path.length ? issue.path.join('.') : '(Datei)'}: ${issue.message}`);
  const more = error.issues.length > limit ? ` (+${error.issues.length - limit} weitere)` : '';
  return issues.join('; ') + more;
}
