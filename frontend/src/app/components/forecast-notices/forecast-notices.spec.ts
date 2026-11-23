import { TestBed } from '@angular/core/testing';
import { ForecastNoticesComponent } from './forecast-notices';
import type { Notice } from '../../models/api';

const FROST: Notice = {
  id: '2026-11-21-frost', type: 'frost', date: '2026-11-21', value: -2.3, threshold: 0, comparator: 'lt', unit: '°C',
};
const RAIN: Notice = {
  id: '2026-11-23-heavy_rain', type: 'heavy_rain', date: '2026-11-23', value: 24, threshold: 20, comparator: 'gte', unit: 'mm',
};

function render(notices: Notice[]) {
  const fixture = TestBed.createComponent(ForecastNoticesComponent);
  fixture.componentRef.setInput('notices', notices);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const normalize = (text: string | null | undefined) => (text ?? '').replace(/ /g, ' ').trim();

describe('ForecastNoticesComponent (N07, US20-6)', () => {
  it('ohne Hinweise: keine Box', () => {
    const el = render([]);
    expect(el.querySelector('app-notice')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('Frost: Hinweisbox im Hinweisstil (nicht Fehlerrot), Kicker „Hinweis“, Text und fester Zusatz', () => {
    const el = render([FROST]);
    const notice = el.querySelector('app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.classList).not.toContain('notice-error');
    expect(notice.getAttribute('role')).toBeNull();
    expect(notice.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Hinweis');
    const lines = Array.from(notice.querySelectorAll('.notice-body p')).map(p => normalize(p.textContent));
    expect(lines).toEqual([
      'Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C',
      'Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst',
    ]);
  });

  it('mehrere Hinweise: je einer eine Zeile in der Reihenfolge der API, der feste Text genau einmal am Ende', () => {
    const el = render([FROST, RAIN]);
    const lines = Array.from(el.querySelectorAll('.notice-body p')).map(p => normalize(p.textContent));
    expect(lines).toEqual([
      'Frost möglich am Samstag, 21.11.: Tiefstwert −2,3 °C',
      'Starkregen möglich am Montag, 23.11.: Niederschlag 24,0 mm',
      'Kein amtlicher Warnhinweis – siehe Deutscher Wetterdienst',
    ]);
    expect(el.querySelectorAll('app-notice')).toHaveLength(1);
  });

  it('kein Link (02/03 sehen keinen DWD-Link vor)', () => {
    expect(render([FROST]).querySelector('a')).toBeNull();
  });
});
