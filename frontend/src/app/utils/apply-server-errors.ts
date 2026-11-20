/**
 * Feldfehler aus einer 400-Antwort der API (B3.3) an die Controls eines Formulars hängen (B5.2).
 * `app-form-field` mit `[control]` zeigt den Fehler `server` dann unter dem Feld an.
 */
import type { HttpErrorResponse } from '@angular/common/http';
import type { FormGroup } from '@angular/forms';
import type { ApiError, ApiFieldError } from '../models/api';

/** Schlüssel des Server-Fehlers am Control: `control.errors.server = message`. */
export const SERVER_ERROR_KEY = 'server';

function isFieldError(value: unknown): value is ApiFieldError {
  if (typeof value !== 'object' || value === null) return false;
  const { field, code, message } = value as Record<string, unknown>;
  return (field === null || typeof field === 'string') && typeof code === 'string' && typeof message === 'string';
}

/** Hat der Body die Form aus B3.3 (mindestens `errors[]` mit `{ field, code, message }`)? */
export function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null) return false;
  const errors = (body as { errors?: unknown }).errors;
  return Array.isArray(errors) && errors.every(isFieldError);
}

/**
 * Setzt je `errors[].field` am passenden Control (auch Punktpfade wie `range.to`) den Fehler
 * `{ server: message }` und markiert es als berührt. Vorhandene Fehler des Controls bleiben erhalten.
 *
 * Rückgabe: die Fehler ohne passendes Control (`field = null` oder unbekannt), damit die Seite sie
 * oben im Formular zeigen kann. Ist die Antwort kein 400 mit `errors[]`, ist die Liste leer und
 * das Formular bleibt unverändert; die Seite zeigt dann die allgemeine Meldung.
 */
export function applyServerErrors(response: HttpErrorResponse, form: FormGroup): ApiFieldError[] {
  if (response.status !== 400 || !isApiError(response.error)) return [];
  const unmatched: ApiFieldError[] = [];
  for (const error of response.error.errors) {
    const control = error.field === null ? null : form.get(error.field);
    if (!control) {
      unmatched.push(error);
      continue;
    }
    if (control.errors?.[SERVER_ERROR_KEY]) continue; // je Feld die erste Meldung
    control.setErrors({ ...(control.errors ?? {}), [SERVER_ERROR_KEY]: error.message });
    control.markAsTouched();
  }
  return unmatched;
}
