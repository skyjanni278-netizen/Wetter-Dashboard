import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DataTableColumn, DataTableComponent, DataTableRow } from './data-table';

const COLUMNS: DataTableColumn[] = [
  { key: 'hour', label: 'Stunde', rowHeader: true },
  { key: 'temp', label: 'Temperatur', align: 'end' },
  { key: 'kind', label: 'Art' },
];

function create(rows: DataTableRow[], extra: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(DataTableComponent);
  fixture.componentRef.setInput('caption', 'Werte am 19.11.2026');
  fixture.componentRef.setInput('columns', COLUMNS);
  fixture.componentRef.setInput('rows', rows);
  for (const [key, value] of Object.entries(extra)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DataTableComponent', () => {
  const rows: DataTableRow[] = [
    { hour: '13:00', temp: '9,7 °C', kind: 'Rückblick' },
    { hour: '15:00', temp: null, kind: { chip: 'Vorhersage', variant: 'forecast' } },
  ];

  it('caption und Spaltenköpfe mit scope="col"', () => {
    const el = create(rows);
    expect(el.querySelector('caption')?.textContent?.trim()).toBe('Werte am 19.11.2026');
    expect(el.querySelector('caption')?.classList).not.toContain('visually-hidden');
    const heads = Array.from(el.querySelectorAll('thead th'));
    expect(heads.map(th => th.textContent?.trim())).toEqual(['Stunde', 'Temperatur', 'Art']);
    expect(heads.every(th => th.getAttribute('scope') === 'col')).toBe(true);
  });

  it('erste Spalte als Zeilenkopf, Zahlen rechtsbündig', () => {
    const el = create(rows);
    const first = el.querySelector('tbody tr') as HTMLTableRowElement;
    expect(first.querySelector('th')?.getAttribute('scope')).toBe('row');
    expect(first.querySelector('th')?.textContent?.trim()).toBe('13:00');
    const temp = first.querySelectorAll('td')[0];
    expect(temp.classList).toContain('cell-end');
    expect(temp.classList).toContain('num');
  });

  it('fehlende Werte als „–“, Chip-Zellen als app-chip', () => {
    const el = create(rows);
    const second = el.querySelectorAll('tbody tr')[1];
    expect(second.querySelectorAll('td')[0].textContent?.trim()).toBe('–');
    const chip = second.querySelector('app-chip');
    expect(chip?.classList).toContain('chip-forecast');
    expect(chip?.textContent).toContain('Vorhersage');
  });

  it('Zahlen ohne Formatierung erscheinen deutsch', () => {
    const el = create([{ hour: '1.', temp: 1234.5, kind: 'Rückblick' }]);
    expect(el.querySelectorAll('tbody td')[0].textContent?.trim()).toBe('1.234,5');
  });

  it('captionHidden blendet die Caption nur visuell aus', () => {
    const el = create(rows, { captionHidden: true });
    expect(el.querySelector('caption')?.classList).toContain('visually-hidden');
  });

  it('leere Zeilen: Hinweiszeile über alle Spalten', () => {
    const el = create([]);
    const cell = el.querySelector('tbody td') as HTMLTableCellElement;
    expect(cell.textContent?.trim()).toBe('Keine Werte vorhanden.');
    expect(cell.getAttribute('colspan')).toBe('3');
  });

  it('Icon-Zelle: Symbol aria-hidden, Text sichtbar', () => {
    const el = create([{ hour: '1.', temp: { icon: '☀️', text: 'Sonnig' }, kind: 'x' }]);
    const td = el.querySelectorAll('tbody td')[0];
    expect(td.querySelector('[aria-hidden="true"]')?.textContent).toBe('☀️');
    expect(td.textContent).toContain('Sonnig');
  });

  describe('columnsNarrow', () => {
    function mockMedia(matches: boolean) {
      vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }));
    }
    afterEach(() => vi.unstubAllGlobals());
    const narrow: DataTableColumn[] = [{ key: 'hour', label: 'Std', rowHeader: true }];

    it('schmal: nur der schmale Spaltensatz', () => {
      mockMedia(true);
      const el = create(rows, { columnsNarrow: narrow });
      expect(Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim())).toEqual(['Std']);
      expect(el.querySelectorAll('tbody tr')[0].children.length).toBe(1);
    });

    it('breit: normaler Spaltensatz', () => {
      mockMedia(false);
      const el = create(rows, { columnsNarrow: narrow });
      expect(el.querySelectorAll('thead th').length).toBe(3);
    });
  });

  it('Link-Zelle (Admin): RouterLink mit sichtbarem Text, im Zeilenkopf und in normalen Zellen', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const el = create([
      { hour: { link: ['/admin/importe', 12], text: '#12', label: 'Import #12 ansehen' }, temp: 1, kind: { link: '/admin/luecken', text: 'Lücken' } },
    ]);
    const head = el.querySelector('tbody th a') as HTMLAnchorElement;
    expect(head.getAttribute('href')).toBe('/admin/importe/12');
    expect(head.textContent?.trim()).toBe('#12');
    expect(head.getAttribute('aria-label')).toBe('Import #12 ansehen');
    const cell = el.querySelector('tbody td:last-child a') as HTMLAnchorElement;
    expect(cell.getAttribute('href')).toBe('/admin/luecken');
    expect(cell.getAttribute('aria-label')).toBeNull();
  });

  describe('Scroll-Bereich bei seitlichem Überlauf (14b, axe scrollable-region-focusable)', () => {
    function fixtureWithWidths(scrollWidth: number, clientWidth: number) {
      const fixture = TestBed.createComponent(DataTableComponent);
      fixture.componentRef.setInput('caption', 'Werte am 19.11.2026');
      fixture.componentRef.setInput('columns', COLUMNS);
      fixture.componentRef.setInput('rows', rows);
      fixture.detectChanges();
      const scroller = (fixture.nativeElement as HTMLElement).querySelector('.table-scroll') as HTMLElement;
      Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: scrollWidth });
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: clientWidth });
      fixture.componentInstance.checkOverflow();
      fixture.detectChanges();
      return scroller;
    }

    it('ohne Überlauf: kein Tabstopp, keine Rolle, kein Name', () => {
      const scroller = fixtureWithWidths(310, 310);
      expect(scroller.hasAttribute('tabindex')).toBe(false);
      expect(scroller.hasAttribute('role')).toBe(false);
      expect(scroller.hasAttribute('aria-label')).toBe(false);
    });

    it('mit Überlauf: tabindex="0", role="region" und Name aus der Tabellenbeschriftung', () => {
      const scroller = fixtureWithWidths(528, 310);
      expect(scroller.getAttribute('tabindex')).toBe('0');
      expect(scroller.getAttribute('role')).toBe('region');
      expect(scroller.getAttribute('aria-label')).toBe('Werte am 19.11.2026');
    });
  });
});
