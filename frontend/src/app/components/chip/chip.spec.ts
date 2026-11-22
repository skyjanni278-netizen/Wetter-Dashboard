import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChipComponent } from './chip';

@Component({
  imports: [ChipComponent],
  template: `
    <app-chip id="status">18 von 30 Tagen</app-chip>
    <app-chip id="forecast" variant="forecast" />
    <app-chip id="forecast-text" variant="forecast">Rest des Tages</app-chip>
    <app-chip id="ok" variant="success">OK</app-chip>
    <app-chip id="failed" variant="danger">Fehler</app-chip>
  `,
})
class Host {}

describe('ChipComponent', () => {
  function chips() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return (id: string) => el.querySelector(`#${id}`) as HTMLElement;
  }

  it('Status-Chip zeigt den projizierten Text ohne Symbol', () => {
    const chip = chips()('status');
    expect(chip.classList).toContain('chip');
    expect(chip.classList).not.toContain('chip-forecast');
    expect(chip.textContent?.trim()).toBe('18 von 30 Tagen');
    expect(chip.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('Vorhersage-Chip: Symbol aria-hidden und Standardtext „Vorhersage“', () => {
    const chip = chips()('forecast');
    expect(chip.classList).toContain('chip-forecast');
    expect(chip.querySelector('[aria-hidden="true"]')?.textContent).toBe('◔');
    expect(chip.textContent?.replace('◔', '').trim()).toBe('Vorhersage');
  });

  it('Vorhersage-Chip mit eigenem Text', () => {
    const chip = chips()('forecast-text');
    expect(chip.textContent?.replace('◔', '').trim()).toBe('Rest des Tages');
  });

  it('Importstatus (E3.7.5): success/danger als Klasse, Text bleibt, kein Symbol', () => {
    const chip = chips();
    expect(chip('ok').classList).toContain('chip-success');
    expect(chip('ok').textContent?.trim()).toBe('OK');
    expect(chip('failed').classList).toContain('chip-danger');
    expect(chip('failed').querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
