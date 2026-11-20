import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { applyServerErrors } from '../../utils/apply-server-errors';
import { FormFieldComponent } from './form-field';

@Component({
  imports: [FormFieldComponent],
  template: `
    <app-form-field label="Datum" fieldId="day" [hint]="hint()" [error]="error()">
      <input id="day" type="date">
    </app-form-field>
  `,
})
class Host {
  hint = signal<string | null>('Daten ab 01.01.2025');
  error = signal<string | null>(null);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el, input: el.querySelector('input') as HTMLInputElement };
}

describe('FormFieldComponent', () => {
  it('sichtbares Label ist mit dem Feld verbunden', () => {
    const { el } = setup();
    const label = el.querySelector('label')!;
    expect(label.textContent?.trim()).toBe('Datum');
    expect(label.getAttribute('for')).toBe('day');
    expect(el.querySelector('app-form-field')?.classList).toContain('form-field');
  });

  it('Hilfetext per aria-describedby, ohne Fehler kein aria-invalid', () => {
    const { el, input } = setup();
    expect(el.querySelector('#day-hint')?.textContent?.trim()).toBe('Daten ab 01.01.2025');
    expect(input.getAttribute('aria-describedby')).toBe('day-hint');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('Fehler: Meldung mit role="alert", aria-invalid und aria-describedby (F09)', () => {
    const { fixture, host, el, input } = setup();
    host.error.set('Bitte ein Datum wählen.');
    fixture.detectChanges();
    const error = el.querySelector('#day-error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Bitte ein Datum wählen.');
    expect(error.querySelector('[aria-hidden="true"]')?.textContent).toBe('!');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('day-hint day-error');
  });

  it('Fehler weg: Attribute werden wieder entfernt', () => {
    const { fixture, host, el, input } = setup();
    host.error.set('Fehler');
    fixture.detectChanges();
    host.error.set(null);
    host.hint.set(null);
    fixture.detectChanges();
    expect(el.querySelector('#day-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });
});

@Component({
  imports: [FormFieldComponent, ReactiveFormsModule],
  template: `
    <form [formGroup]="form">
      <app-form-field label="Bis" fieldId="import-to" [control]="form.controls.to" [error]="error()">
        <input id="import-to" type="date" formControlName="to">
      </app-form-field>
    </form>
  `,
})
class ServerHost {
  form = new FormGroup({ to: new FormControl('2026-11-21') });
  error = signal<string | null>(null);
}

describe('FormFieldComponent mit Server-Fehler (B5.2, E3.7.3)', () => {
  function serverSetup() {
    const fixture = TestBed.createComponent(ServerHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el, input: el.querySelector('input') as HTMLInputElement };
  }

  function badRequest(field: string, message: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status: 400,
      error: {
        statusCode: 400, error: 'Bad Request', code: 'DATE_IN_FUTURE', message,
        errors: [{ field, code: 'too_big', message }], details: null,
      },
    });
  }

  it('ohne Server-Fehler: kein aria-invalid, keine Meldung', () => {
    const { el, input } = serverSetup();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(el.querySelector('#import-to-error')).toBeNull();
  });

  it('400 mit field "to": Meldung unter dem Feld, aria-invalid und aria-describedby, Fehlerklasse', async () => {
    const { fixture, host, el, input } = serverSetup();
    applyServerErrors(badRequest('to', 'Das Datum liegt in der Zukunft.'), host.form);
    fixture.detectChanges();
    await fixture.whenStable();

    const error = el.querySelector('#import-to-error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Das Datum liegt in der Zukunft.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('import-to-error');
    expect(el.querySelector('app-form-field')?.classList).toContain('form-field-invalid');
  });

  it('Wertänderung entfernt den Server-Fehler wieder', async () => {
    const { fixture, host, el, input } = serverSetup();
    applyServerErrors(badRequest('to', 'Zukunft'), host.form);
    fixture.detectChanges();
    await fixture.whenStable();

    input.value = '2026-11-19';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.form.controls.to.errors).toBeNull();
    expect(el.querySelector('#import-to-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('Fehler der Seite (error) hat Vorrang vor dem Server-Fehler', async () => {
    const { fixture, host, el } = serverSetup();
    applyServerErrors(badRequest('to', 'Server-Meldung'), host.form);
    host.error.set('Seiten-Meldung');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('#import-to-error')?.textContent).toContain('Seiten-Meldung');
  });
});
