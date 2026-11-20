import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { ApiError, ApiFieldError } from '../models/api';
import { applyServerErrors, isApiError } from './apply-server-errors';

function apiError(errors: ApiFieldError[]): ApiError {
  return {
    statusCode: 400,
    error: 'Bad Request',
    code: 'VALIDATION_FAILED',
    message: 'Die Anfrage enthält ungültige Werte.',
    errors,
    details: null,
  };
}

function response(body: unknown, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, url: '/api/imports' });
}

function importForm() {
  return new FormGroup({
    kind: new FormControl('range'),
    from: new FormControl('2026-10-31'),
    to: new FormControl('2026-10-01', Validators.required),
  });
}

describe('applyServerErrors (B5.2)', () => {
  it('400 mit field "to" setzt den Fehler am Control to', () => {
    const form = importForm();
    const unmatched = applyServerErrors(
      response(apiError([{ field: 'to', code: 'to_before_from', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' }])),
      form,
    );
    expect(unmatched).toEqual([]);
    expect(form.controls.to.errors).toEqual({ server: 'Das Enddatum darf nicht vor dem Startdatum liegen.' });
    expect(form.controls.to.touched).toBe(true);
    expect(form.controls.from.errors).toBeNull();
    expect(form.valid).toBe(false);
  });

  it('der Server-Fehler entfällt, sobald der Nutzer den Wert ändert', () => {
    const form = importForm();
    applyServerErrors(response(apiError([{ field: 'to', code: 'too_big', message: 'Zukunft' }])), form);
    form.controls.to.setValue('2026-11-01');
    expect(form.controls.to.errors).toBeNull();
  });

  it('unbekannte Felder und field = null kommen zurück, bekannte werden gesetzt', () => {
    const form = importForm();
    const unknown: ApiFieldError = { field: 'x', code: 'unrecognized_keys', message: 'Das Feld „x“ ist nicht erlaubt.' };
    const whole: ApiFieldError = { field: null, code: 'invalid_type', message: 'Der Body muss ein JSON-Objekt sein.' };
    const unmatched = applyServerErrors(
      response(apiError([unknown, { field: 'kind', code: 'invalid_value', message: 'Nur range und gaps.' }, whole])),
      form,
    );
    expect(unmatched).toEqual([unknown, whole]);
    expect(form.controls.kind.errors).toEqual({ server: 'Nur range und gaps.' });
  });

  it('Punktpfad trifft verschachtelte Controls; je Feld gilt die erste Meldung', () => {
    const form = new FormGroup({ range: new FormGroup({ to: new FormControl('') }) });
    applyServerErrors(
      response(
        apiError([
          { field: 'range.to', code: 'invalid_date', message: 'erste' },
          { field: 'range.to', code: 'too_big', message: 'zweite' },
        ]),
      ),
      form,
    );
    expect(form.get('range.to')?.errors).toEqual({ server: 'erste' });
  });

  it('vorhandene Fehler am Control bleiben erhalten', () => {
    const form = new FormGroup({ to: new FormControl('', Validators.required) });
    applyServerErrors(response(apiError([{ field: 'to', code: 'invalid_date', message: 'ungültig' }])), form);
    expect(form.controls.to.errors).toEqual({ required: true, server: 'ungültig' });
  });

  it('kein 400 oder kein errors[] → nichts gesetzt, leere Liste', () => {
    const form = importForm();
    expect(applyServerErrors(response(apiError([{ field: 'to', code: 'x', message: 'm' }]), 409), form)).toEqual([]);
    expect(applyServerErrors(response({ statusCode: 400, message: 'Bad Request' }), form)).toEqual([]);
    expect(applyServerErrors(response('Proxy-Fehler', 400), form)).toEqual([]);
    expect(form.controls.to.errors).toBeNull();
  });
});

describe('isApiError', () => {
  it('erkennt die Form aus B3.3', () => {
    expect(isApiError(apiError([]))).toBe(true);
    expect(isApiError(apiError([{ field: null, code: 'c', message: 'm' }]))).toBe(true);
    expect(isApiError({ errors: [{ field: 1, code: 'c', message: 'm' }] })).toBe(false);
    expect(isApiError({ errors: 'x' })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
