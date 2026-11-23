import { z } from 'zod';
import { WMO_CODES } from '../observation.entity';
import type { ObservationValues } from '../observation';

/** Messwerte, die eine Korrektur ändern darf (03 B2.2, R16), in der Schreibweise der API. */
export const MEASUREMENT_FIELDS = [
  'temperature',
  'apparentTemperature',
  'precipitation',
  'weatherCode',
  'windSpeed',
  'windDirection',
] as const satisfies readonly (keyof ObservationValues)[];

/** Länge der Begründung wie `CHK_correction_reason` (03 B2.6). */
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

const ONE_DECIMAL = 'Höchstens eine Nachkommastelle.';

/**
 * Ein Messwert nach R16: Zahl (kein Text wie `"9,6"`) mit höchstens einer Nachkommastelle in den Grenzen des
 * DB-`CHECK`, oder `null` („unbekannt“, R14). Fehlt das Feld, bleibt der Wert unverändert (Merge-Patch, B2.5).
 */
function measurement(label: string, min: number, max: number, unit: string) {
  const range = `${label} muss zwischen ${String(min).replace('-', '−')} und ${max} ${unit} liegen.`;
  return z
    .number({ error: `${label} muss eine Zahl oder null sein.` })
    .min(min, { error: range })
    .max(max, { error: range })
    .multipleOf(0.1, { error: ONE_DECIMAL })
    .nullable()
    .optional();
}

/** Begründung einer Korrektur oder Rücknahme (Pflicht, 3–500 Zeichen ohne Leerzeichen am Rand). */
export const ReasonSchema = z
  .string({ error: 'Bitte einen Grund angeben.' })
  .trim()
  .min(REASON_MIN_LENGTH, { error: `Der Grund muss mindestens ${REASON_MIN_LENGTH} Zeichen lang sein.` })
  .max(REASON_MAX_LENGTH, { error: `Der Grund darf höchstens ${REASON_MAX_LENGTH} Zeichen lang sein.` })
  .describe(`Begründung, ${REASON_MIN_LENGTH} bis ${REASON_MAX_LENGTH} Zeichen`);

/**
 * Body von `PATCH /api/observations/:id` (US13-2/-5/-6/-7, R16): JSON Merge Patch mit den sechs Messwerten
 * und der Pflicht-Begründung. `.strict()`: `source`, `timeUtc`, `id`, `version` … → `unrecognized_keys` je Feld.
 * Ohne einen einzigen Messwert → Fehler am ganzen Objekt (`field: null`, `missing_measurement`, US13-7).
 * Ob die Stunde eine Vorhersage ist (R08 → 409) und die Version (R17 → 412) prüft der `CorrectionsService`.
 */
export const ObservationPatchSchema = z
  .object(
    {
      temperature: measurement('Die Temperatur', -50, 50, '°C'),
      apparentTemperature: measurement('Die gefühlte Temperatur', -70, 60, '°C'),
      precipitation: measurement('Der Niederschlag', 0, 200, 'mm'),
      weatherCode: z
        .number({ error: 'Der Wettercode muss eine Zahl oder null sein.' })
        .int({ error: 'Der Wettercode muss eine ganze Zahl sein.' })
        .refine(code => (WMO_CODES as readonly number[]).includes(code), {
          error: 'Unbekannter Wettercode (erlaubt sind die WMO-Codes aus R15).',
          params: { code: 'invalid_value' },
        })
        .nullable()
        .optional(),
      windSpeed: measurement('Die Windgeschwindigkeit', 0, 300, 'km/h'),
      windDirection: z
        .number({ error: 'Die Windrichtung muss eine Zahl oder null sein.' })
        .int({ error: 'Die Windrichtung muss eine ganze Zahl in Grad sein.' })
        .min(0, { error: 'Die Windrichtung muss zwischen 0 und 360° liegen.' })
        .max(360, { error: 'Die Windrichtung muss zwischen 0 und 360° liegen.' })
        .nullable()
        .optional(),
      reason: ReasonSchema,
    },
    { error: 'Der Body muss ein JSON-Objekt sein.' },
  )
  .strict()
  .superRefine((value, ctx) => {
    if (MEASUREMENT_FIELDS.every(field => value[field] === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Bitte mindestens einen Messwert angeben.',
        params: { code: 'missing_measurement' },
      });
    }
  });

export type ObservationPatch = z.infer<typeof ObservationPatchSchema>;
