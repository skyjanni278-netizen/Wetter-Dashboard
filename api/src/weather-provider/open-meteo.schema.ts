import { z } from 'zod';

/**
 * Das **eine** Variablen-Mapping für Open-Meteo (S7): Feld im Datenmodell → Name bei Open-Meteo.
 * Gilt für die Archiv- und die Forecast-API gleichermaßen.
 */
export const HOURLY_VARIABLES = {
  temperature: 'temperature_2m',
  apparentTemperature: 'apparent_temperature',
  precipitation: 'precipitation',
  weatherCode: 'weather_code',
  windSpeed: 'wind_speed_10m',
  windDirection: 'wind_direction_10m',
} as const;

export const DAILY_VARIABLES = {
  maxTemp: 'temperature_2m_max',
  minTemp: 'temperature_2m_min',
  precipitationSum: 'precipitation_sum',
  weatherCode: 'weather_code',
} as const;

/** Einzelwerte dürfen `null` sein und bleiben `null` (R14, R32). */
const series = z.array(z.number().nullable());

/** Mit `timezone=GMT` liefert Open-Meteo Zeitstempel ohne Offset, die UTC bedeuten. */
const utcHour = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Zeitstempel nicht im Format YYYY-MM-DDTHH:MM');
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum nicht im Format YYYY-MM-DD');

/** Alle Arrays eines Blocks müssen so lang sein wie `time`. */
function equalLengths(block: Record<string, unknown[]>, ctx: z.RefinementCtx): void {
  const expected = block['time'].length;
  for (const [key, values] of Object.entries(block)) {
    if (values.length !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${values.length} Werte, erwartet ${expected} (Länge von time)`,
      });
    }
  }
}

export const OpenMeteoHourlySchema = z
  .object({
    time: z.array(utcHour),
    [HOURLY_VARIABLES.temperature]: series,
    [HOURLY_VARIABLES.apparentTemperature]: series,
    [HOURLY_VARIABLES.precipitation]: series,
    [HOURLY_VARIABLES.weatherCode]: series,
    [HOURLY_VARIABLES.windSpeed]: series,
    [HOURLY_VARIABLES.windDirection]: series,
  })
  .superRefine(equalLengths);

export const OpenMeteoDailySchema = z
  .object({
    time: z.array(calendarDate),
    [DAILY_VARIABLES.maxTemp]: series,
    [DAILY_VARIABLES.minTemp]: series,
    [DAILY_VARIABLES.precipitationSum]: series,
    [DAILY_VARIABLES.weatherCode]: series,
  })
  .superRefine(equalLengths);

/** Stundenwerte: `utc_offset_seconds` muss 0 sein, sonst sind die Zeitstempel keine UTC-Zeitpunkte (R06, R32). */
const utcOffset = z.literal(0, { error: 'utc_offset_seconds muss 0 sein (timezone=GMT)' });

/**
 * R32: Antwort auf eine Abfrage der Stundenwerte. `hourly` fehlt, Arrays ungleich lang oder
 * `utc_offset_seconds ≠ 0` → Import `failed` mit `UPSTREAM_INVALID`. Weitere Felder werden ignoriert.
 */
export const OpenMeteoResponseSchema = z.object({
  utc_offset_seconds: utcOffset,
  hourly: OpenMeteoHourlySchema,
});

/**
 * Antwort auf eine Abfrage der Tagesvorhersage (`daily`). Anders als bei den Stundenwerten wird sie mit
 * `timezone=Europe/Berlin` abgefragt, weil Tageswerte für **Berliner** Kalendertage gelten müssen
 * (Fachregel vor R32). Deshalb muss `utc_offset_seconds` 3600 (MEZ) oder 7200 (MESZ) sein.
 */
export const OpenMeteoDailyResponseSchema = z.object({
  utc_offset_seconds: z.union([z.literal(3600), z.literal(7200)], {
    error: 'utc_offset_seconds muss 3600 oder 7200 sein (timezone=Europe/Berlin)',
  }),
  daily: OpenMeteoDailySchema,
});

export type OpenMeteoResponse = z.infer<typeof OpenMeteoResponseSchema>;
export type OpenMeteoDailyResponse = z.infer<typeof OpenMeteoDailyResponseSchema>;
