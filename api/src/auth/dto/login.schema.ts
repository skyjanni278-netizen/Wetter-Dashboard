import { z } from 'zod';
import { MAX_PASSWORD_BYTES, passwordBytes } from '../../users/password';
import { UsernameSchema } from '../../users/username.schema';

/**
 * Body von `POST /api/auth/tokens` (03 B4.6, R21, US09-4/-5): `username` getrimmt, klein, 3–50 Zeichen;
 * `password` mindestens 1 Zeichen und höchstens 72 Byte (bcrypt-Grenze). `.strict()` gegen Zusatzfelder
 * (Mass Assignment, z. B. `roles`). Die Länge von 12 Zeichen gilt nur für **neue** Passwörter (CLI).
 */
export const LoginSchema = z
  .object(
    {
      username: UsernameSchema,
      password: z
        .string({ error: 'Das Passwort fehlt.' })
        .min(1, { error: 'Das Passwort fehlt.' })
        .refine(value => passwordBytes(value) <= MAX_PASSWORD_BYTES, {
          message: `Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte lang sein.`,
          params: { code: 'too_big' },
        }),
    },
    { error: 'Der Body muss ein JSON-Objekt sein.' },
  )
  .strict();

export type LoginDto = z.infer<typeof LoginSchema>;
