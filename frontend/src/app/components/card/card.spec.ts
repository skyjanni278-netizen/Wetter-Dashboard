import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardComponent } from './card';

@Component({
  imports: [CardComponent],
  template: `<app-card [edge]="edge()" [busy]="busy()" [reveal]="reveal()" [revealIndex]="index()"><p>Inhalt</p></app-card>`,
})
class Host {
  edge = signal(true);
  busy = signal(false);
  reveal = signal(false);
  index = signal(0);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const card = (fixture.nativeElement as HTMLElement).querySelector('app-card') as HTMLElement;
  return { fixture, host: fixture.componentInstance, card };
}

describe('CardComponent', () => {
  it('zeigt projizierten Inhalt mit Klasse card und Kante', () => {
    const { card } = setup();
    expect(card.classList).toContain('card');
    expect(card.classList).not.toContain('card-no-edge');
    expect(card.querySelector('p')?.textContent).toBe('Inhalt');
  });

  it('edge=false entfernt die Akzentkante', () => {
    const { fixture, host, card } = setup();
    host.edge.set(false);
    fixture.detectChanges();
    expect(card.classList).toContain('card-no-edge');
  });

  it('busy: aria-busy und Ladebalken (E3.7.8), Inhalt bleibt stehen', () => {
    const { fixture, host, card } = setup();
    expect(card.getAttribute('aria-busy')).toBeNull();
    expect(card.querySelector('.card-progress')).toBeNull();
    host.busy.set(true);
    fixture.detectChanges();
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.querySelector('.card-progress')?.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('p')?.textContent).toBe('Inhalt');
  });

  it('reveal setzt Klasse und Staffelung (E3.6)', () => {
    const { fixture, host, card } = setup();
    expect(card.classList).not.toContain('reveal');
    host.reveal.set(true);
    host.index.set(3);
    fixture.detectChanges();
    expect(card.classList).toContain('reveal');
    expect(card.style.getPropertyValue('--reveal-index')).toBe('3');
  });
});
