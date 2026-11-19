import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KpiCardComponent } from './kpi-card';
import { ChipComponent } from '../chip/chip';

function create(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(KpiCardComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

@Component({
  imports: [KpiCardComponent, ChipComponent],
  template: `<app-kpi-card kicker="Niederschlag bis jetzt" [value]="1.2" unit="mm" meta="+0,4 mm erwartet"><app-chip variant="forecast" /></app-kpi-card>`,
})
class Host {}

describe('KpiCardComponent', () => {
  it('Kicker, große Zahl deutsch gerundet und Einheit', () => {
    const el = create({ kicker: 'Höchstwert', value: 9.66, unit: '°C' });
    expect(el.querySelector('.kicker')?.textContent?.trim()).toBe('Höchstwert');
    expect(el.querySelector('.kpi-value .num')?.textContent?.trim()).toBe('9,7');
    expect(el.querySelector('.kpi-unit')?.textContent?.trim()).toBe('°C');
    expect(el.querySelector('app-card')).not.toBeNull();
  });

  it('digits steuert die Nachkommastellen', () => {
    const el = create({ kicker: 'Tage', value: 18, digits: 0 });
    expect(el.querySelector('.kpi-value .num')?.textContent?.trim()).toBe('18');
  });

  it('ohne Wert: „–“ und „keine Daten“, keine Einheit', () => {
    const el = create({ kicker: 'Tiefstwert', value: null, unit: '°C' });
    expect(el.querySelector('.kpi-value .num')?.textContent?.trim()).toBe('–');
    expect(el.querySelector('.kpi-unit')).toBeNull();
    expect(el.querySelector('.kpi-meta')?.textContent?.trim()).toBe('keine Daten');
  });

  it('Text-Werte werden unverändert gezeigt', () => {
    const el = create({ kicker: 'Wärmster Monat', value: 'Juli' });
    expect(el.querySelector('.kpi-value .num')?.textContent?.trim()).toBe('Juli');
  });

  it('loading: Skelett statt Zahl, keine „0“ (V14)', () => {
    const el = create({ kicker: 'Niederschlag', value: 0, loading: true });
    expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('.kpi-value')).toBeNull();
    expect(el.textContent).not.toContain('0');
  });

  it('busy reicht aria-busy an die Karte weiter', () => {
    const el = create({ kicker: 'Wind', value: 3, busy: true });
    expect(el.querySelector('app-card')?.getAttribute('aria-busy')).toBe('true');
  });

  it('Zusatzzeile mit meta und projiziertem Chip', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const meta = (fixture.nativeElement as HTMLElement).querySelector('.kpi-meta')!;
    expect(meta.textContent).toContain('+0,4 mm erwartet');
    expect(meta.querySelector('app-chip')?.textContent).toContain('Vorhersage');
  });
});
