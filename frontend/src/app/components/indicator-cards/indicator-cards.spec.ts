import { TestBed } from '@angular/core/testing';
import { IndicatorCardsComponent } from './indicator-cards';
import { SummaryBase } from '../../models/api';

function summary(overrides: Partial<SummaryBase> = {}): SummaryBase {
  return {
    locationId: 1, daysExpected: 31, daysComplete: 31, complete: true,
    temperature: { mean: 1, min: -6, max: 9, minAt: null, maxAt: null },
    precipitationSum: 40, dryDays: 19,
    indicators: { frostDays: 14, iceDays: 3, summerDays: 0, hotDays: 0, precipitationDays: 12 },
    meanMethod: 'mean_of_daily_means',
    ...overrides,
  };
}

function create(s: SummaryBase) {
  const fixture = TestBed.createComponent(IndicatorCardsComponent);
  fixture.componentRef.setInput('summary', s);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('IndicatorCardsComponent (N05, US18)', () => {
  it('h2 „Kenntage“ und sechs Karten mit Kicker, Ganzzahl und Definition', () => {
    const el = create(summary());
    const section = el.querySelector('section')!;
    expect(section.getAttribute('aria-labelledby')).toBe('indicators-title');
    expect(section.querySelector('h2#indicators-title')?.textContent?.trim()).toBe('Kenntage');
    const kickers = Array.from(el.querySelectorAll('app-kpi-card .kpi-kicker')).map(k => k.textContent?.trim());
    expect(kickers).toEqual(['Frosttage', 'Eistage', 'Sommertage', 'Heiße Tage', 'Niederschlagstage', 'Trockentage']);
    const values = Array.from(el.querySelectorAll('app-kpi-card .kpi-value .num')).map(v => v.textContent?.trim());
    expect(values).toEqual(['14', '3', '0', '0', '12', '19']);
    const metas = Array.from(el.querySelectorAll('app-kpi-card .kpi-meta')).map(m => m.textContent?.trim());
    // Zahl und Einheit mit geschütztem Leerzeichen
    expect(metas[0]).toBe('Tiefstwert unter 0 °C');
    expect(metas[3]).toBe('Höchstwert ab 30 °C');
    expect(metas[5]).toBe('unter 0,1 mm Niederschlag');
  });

  it('vollständiger Zeitraum: kein Hinweis', () => {
    expect(create(summary()).querySelector('.kpi-section-hint')).toBeNull();
  });

  it('unvollständig: Hinweis „nur vollständige Tage“ mit daysComplete/daysExpected', () => {
    const el = create(summary({ complete: false, daysComplete: 18, daysExpected: 30 }));
    expect(el.querySelector('.kpi-section-hint')?.textContent?.trim()).toBe('Gezählt sind nur die 18 vollständigen Tage von 30.');
  });

  it('Einzahl und kein vollständiger Tag', () => {
    expect(create(summary({ complete: false, daysComplete: 1, daysExpected: 30 })).querySelector('.kpi-section-hint')?.textContent?.trim())
      .toBe('Gezählt ist nur 1 vollständiger Tag von 30.');
    TestBed.resetTestingModule();
    expect(create(summary({ complete: false, daysComplete: 0, daysExpected: 30, dryDays: 0,
      indicators: { frostDays: 0, iceDays: 0, summerDays: 0, hotDays: 0, precipitationDays: 0 } }))
      .querySelector('.kpi-section-hint')?.textContent?.trim())
      .toBe('Noch kein vollständiger Tag von 30; gezählt werden nur vollständige Tage.');
  });
});
