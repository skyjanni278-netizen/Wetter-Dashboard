import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadingComponent } from './loading';
import { EmptyComponent } from './empty';
import { ErrorComponent } from './error';
import { SkeletonComponent } from '../skeleton/skeleton';

@Component({
  imports: [LoadingComponent, SkeletonComponent],
  template: `
    <app-loading id="default" />
    <app-loading id="custom" label="Rekorde werden geladen"><app-skeleton class="own" height="4rem" /></app-loading>
  `,
})
class LoadingHost {}

@Component({
  imports: [EmptyComponent],
  template: `<app-empty message="Für November 2024 liegen keine Daten vor."><a href="/monat/2025/01">Zum Januar 2025</a></app-empty>`,
})
class EmptyHost {}

@Component({
  imports: [ErrorComponent],
  template: `
    <app-error message="Server nicht erreichbar." [details]="details()" [retryable]="retryable()" (retry)="retries = retries + 1">
      <a href="/tag/2025-01-01">Zum 01.01.2025</a>
    </app-error>
  `,
})
class ErrorHost {
  details = signal<string[]>([]);
  retryable = signal(true);
  retries = 0;
}

describe('app-loading', () => {
  it('Text für Screenreader per aria-live, Standard-Skelett', () => {
    const fixture = TestBed.createComponent(LoadingHost);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('#default')!;
    const live = el.querySelector('[aria-live="polite"]')!;
    expect(live.textContent?.trim()).toBe('Daten werden geladen');
    expect(live.classList).toContain('visually-hidden');
    expect(el.querySelectorAll('app-skeleton').length).toBe(1);
    expect(el.textContent).not.toContain('0');
  });

  it('eigener Text und eigene Skelette ersetzen den Standard', () => {
    const fixture = TestBed.createComponent(LoadingHost);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('#custom')!;
    expect(el.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Rekorde werden geladen');
    expect(el.querySelectorAll('app-skeleton').length).toBe(1);
    expect(el.querySelector('app-skeleton.own')).not.toBeNull();
  });
});

describe('app-empty', () => {
  it('Hinweisbox mit Meldung und projiziertem Link', () => {
    const fixture = TestBed.createComponent(EmptyHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const notice = el.querySelector('app-notice')!;
    expect(notice.classList).toContain('notice-info');
    expect(notice.getAttribute('role')).toBeNull();
    expect(notice.textContent).toContain('Für November 2024 liegen keine Daten vor.');
    expect(notice.querySelector('a')?.getAttribute('href')).toBe('/monat/2025/01');
  });
});

describe('app-error', () => {
  function setup() {
    const fixture = TestBed.createComponent(ErrorHost);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('Fehlerbox mit role="alert", Kicker „Fehler“ und Meldung', () => {
    const { el } = setup();
    const notice = el.querySelector('app-notice')!;
    expect(notice.classList).toContain('notice-error');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.querySelector('.notice-kicker')?.textContent?.trim()).toBe('Fehler');
    expect(notice.textContent).toContain('Server nicht erreichbar.');
    expect(notice.querySelector('a')?.textContent).toBe('Zum 01.01.2025');
  });

  it('„Erneut versuchen“ löst den Output retry aus', () => {
    const { fixture, host, el } = setup();
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Erneut versuchen');
    expect(button.classList).toContain('btn-primary');
    expect(button.type).toBe('button');
    button.click();
    fixture.detectChanges();
    expect(host.retries).toBe(1);
  });

  it('retryable=false blendet den Button aus', () => {
    const { fixture, host, el } = setup();
    host.retryable.set(false);
    fixture.detectChanges();
    expect(el.querySelector('button')).toBeNull();
  });

  it('Feldfehler als Liste', () => {
    const { fixture, host, el } = setup();
    expect(el.querySelector('ul')).toBeNull();
    host.details.set(['to: Datum liegt in der Zukunft']);
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('li')).map(li => li.textContent?.trim())).toEqual(['to: Datum liegt in der Zukunft']);
  });
});
