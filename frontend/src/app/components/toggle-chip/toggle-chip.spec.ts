import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToggleChipComponent } from './toggle-chip';

@Component({
  imports: [ToggleChipComponent],
  template: `
    <app-toggle-chip [pressed]="pressed()" [disabled]="disabled()" describedBy="hint"
                     (pressedChange)="changes.push($event)">Vorjahr vergleichen</app-toggle-chip>
    <p id="hint">Kein Vorjahr mit Daten</p>
  `,
})
class Host {
  pressed = signal(false);
  disabled = signal(false);
  changes: boolean[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, button };
}

describe('ToggleChipComponent', () => {
  it('Button mit type="button", aria-pressed="false" und dem projizierten Text', () => {
    const b = setup().button();
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.hasAttribute('aria-disabled')).toBe(false);
    expect(b.textContent?.trim()).toBe('Vorjahr vergleichen');
    expect(b.getAttribute('aria-describedby')).toBe('hint');
  });

  it('Klick meldet den neuen Zustand, die Seite setzt ihn (kein eigener Zustand)', () => {
    const { fixture, host, button } = setup();
    button().click();
    expect(host.changes).toEqual([true]);
    expect(button().getAttribute('aria-pressed')).toBe('false');
    host.pressed.set(true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().querySelector('.toggle-chip-check')?.getAttribute('aria-hidden')).toBe('true');
    button().click();
    expect(host.changes).toEqual([true, false]);
  });

  it('deaktiviert: aria-disabled, nicht gedrückt, kein Häkchen, Klick ohne Wirkung, bleibt fokussierbar', () => {
    const { fixture, host, button } = setup();
    host.pressed.set(true);
    host.disabled.set(true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(button().querySelector('.toggle-chip-check')).toBeNull();
    button().click();
    expect(host.changes).toEqual([]);
  });
});
