import { TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton';

describe('SkeletonComponent', () => {
  it('ist für Screenreader verborgen und hat Standardgröße', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1rem');
    expect(el.textContent).toBe('');
  });

  it('übernimmt Breite und Höhe', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('width', '60%');
    fixture.componentRef.setInput('height', '8rem');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.style.width).toBe('60%');
    expect(el.style.height).toBe('8rem');
  });
});
