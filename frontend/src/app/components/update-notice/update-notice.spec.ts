import { TestBed } from '@angular/core/testing';
import { UpdateNoticeComponent } from './update-notice';
import { statusOf } from '../../testing/admin-fixtures';
import type { Status } from '../../models/api';

function render(status: Status, now = new Date('2026-11-19T13:30:00Z')) {
  const fixture = TestBed.createComponent(UpdateNoticeComponent);
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('now', now);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UpdateNoticeComponent (N01, US16-5)', () => {
  it('ok: keine Box', () => {
    const el = render(statusOf({ today: '2026-11-19', updateState: 'ok' }));
    expect(el.querySelector('app-notice')).toBeNull();
  });

  it('delayed: Hinweisbox (Linie links, nicht Fehlerrot) mit „seit 3 Stunden keine Aktualisierung“', () => {
    const el = render(statusOf({ today: '2026-11-19', lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' }));
    const notice = el.querySelector('app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.classList).not.toContain('notice-error');
    expect(notice.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Hinweis');
    expect(notice.textContent).toContain('Stand: 19.11.2026, 11:05 Uhr – seit 3 Stunden keine Aktualisierung');
    expect(notice.getAttribute('role')).toBeNull();
  });

  it('never: eigener Zustand mit Kicker „Datenstand“', () => {
    const el = render(statusOf({ today: '2026-11-19', dataTo: '2026-11-19', lastSuccessfulUpdateAt: null, updateState: 'never' }));
    const notice = el.querySelector('app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Datenstand');
    expect(notice.textContent).toContain('Die Daten wurden noch nie automatisch aktualisiert.');
  });
});
