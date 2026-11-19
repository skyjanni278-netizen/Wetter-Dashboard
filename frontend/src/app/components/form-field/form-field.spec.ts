import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
