import { TestBed } from '@angular/core/testing';
import { NoticeComponent } from './notice';

function create(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(NoticeComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('NoticeComponent', () => {
  it.each([
    ['info', 'Hinweis'],
    ['error', 'Fehler'],
    ['forecast', 'Vorhersage'],
  ])('Variante %s mit Kicker „%s“', (variant, kicker) => {
    const el = create({ variant });
    expect(el.classList).toContain(`notice-${variant}`);
    expect(el.querySelector('.notice-kicker')?.textContent?.replace('◔', '').trim()).toBe(kicker);
  });

  it('Standard: info ohne Rolle (nicht nachträglich)', () => {
    const el = create();
    expect(el.classList).toContain('notice-info');
    expect(el.getAttribute('role')).toBeNull();
  });

  it('Vorhersage trägt das Symbol „◔“ aria-hidden', () => {
    const el = create({ variant: 'forecast' });
    expect(el.querySelector('.notice-kicker [aria-hidden="true"]')?.textContent).toBe('◔');
  });

  it('eigener Kicker', () => {
    const el = create({ kicker: 'Datenstand' });
    expect(el.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Datenstand');
  });

  it('announce: Fehler als role="alert", sonst role="status"', () => {
    expect(create({ variant: 'error', announce: true }).getAttribute('role')).toBe('alert');
    expect(create({ variant: 'info', announce: true }).getAttribute('role')).toBe('status');
    expect(create({ variant: 'error' }).getAttribute('role')).toBeNull();
  });
});
