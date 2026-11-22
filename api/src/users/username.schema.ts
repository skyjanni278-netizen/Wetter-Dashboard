import { z } from 'zod';

/**
 * Benutzername (03 B4.6, R21): getrimmt und klein geschrieben, 3 bis 50 Zeichen. Gleich für die Anmeldung
 * (`LoginSchema`) und die CLI (`admin:create`, `admin:set-password`), damit beide denselben Namen speichern bzw.
 * suchen.
 */
export const UsernameSchema = z
  .string({ error: 'Der Benutzername fehlt.' })
  .trim()
  .toLowerCase()
  .min(3, { error: 'Der Benutzername muss mindestens 3 Zeichen haben.' })
  .max(50, { error: 'Der Benutzername darf höchstens 50 Zeichen haben.' });
