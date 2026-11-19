import { TestBed } from '@angular/core/testing';
import { Chart, ChartConfiguration } from 'chart.js';
import { ClimateChartComponent, ClimateChartDataset } from './climate-chart';

const DAY: ClimateChartDataset = {
  labels: ['12:00', '13:00', '14:00', '15:00'],
  temperatures: [8, 9.66, null, 7],
  precipitations: [0.2, 0, 0.4, 1.5],
};

interface FakeChart {
  data: { labels: string[]; datasets: { data: (number | null)[] }[] };
  options: Record<string, unknown>;
  update: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

/** Ersetzt Canvas und Chart.js, damit jsdom ohne Canvas-Paket auskommt. */
function stubChart() {
  const fake2d = new Proxy({}, { get: (_t, prop) => (prop === 'createPattern' ? () => null : () => undefined) });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake2d as unknown as CanvasRenderingContext2D);
  const charts: FakeChart[] = [];
  const configs: ChartConfiguration<'bar' | 'line', (number | null)[], string>[] = [];
  const create = vi.spyOn(ClimateChartComponent.prototype as unknown as { createChart: () => unknown }, 'createChart')
    .mockImplementation(((_canvas: HTMLCanvasElement, config: ChartConfiguration<'bar' | 'line', (number | null)[], string>) => {
      configs.push(config);
      const chart: FakeChart = {
        data: { labels: [...(config.data.labels ?? [])], datasets: config.data.datasets.map(d => ({ data: [...d.data] })) },
        options: { ...config.options },
        update: vi.fn(),
        destroy: vi.fn(),
      };
      charts.push(chart);
      return chart;
    }) as never);
  return { charts, configs, create };
}

async function create(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ClimateChartComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ClimateChartComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('figure mit figcaption, Canvas mit role="img" und Namen (V07, F17)', async () => {
    stubChart();
    const { el } = await create({ data: DAY, title: 'Tagesverlauf' });
    const figure = el.querySelector('figure')!;
    expect(figure.querySelector('h2')?.textContent?.trim()).toBe('Tagesverlauf');
    expect(figure.querySelector('figcaption')?.textContent?.trim())
      .toBe('Temperatur von 7,0 °C bis 9,7 °C, Niederschlag zusammen 2,1 mm.');
    const canvas = figure.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Diagramm Tagesverlauf, 12:00 bis 15:00');
    expect(canvas.getAttribute('aria-label')).toContain('Werte als Tabelle');
  });

  it('HTML-Legende statt Chart.js-Legende; nur benötigte Teile registriert (V23)', async () => {
    stubChart();
    const { el } = await create({ data: DAY });
    const items = Array.from(el.querySelectorAll('.chart-legend li')).map(li => li.textContent?.trim());
    expect(items).toEqual(['Temperatur (°C), Linie', 'Niederschlag (mm), Balken']);
    expect(() => Chart.registry.getPlugin('legend')).toThrow();
    expect(() => Chart.registry.getController('line')).not.toThrow();
    expect(() => Chart.registry.getController('bar')).not.toThrow();
  });

  it('Datentabelle „Werte als Tabelle“ in <details>, Lücken als „–“', async () => {
    stubChart();
    const { el } = await create({ data: DAY, labelHeading: 'Stunde' });
    const details = el.querySelector('details')!;
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('Werte als Tabelle');
    const heads = Array.from(details.querySelectorAll('thead th')).map(th => th.textContent?.trim());
    expect(heads).toEqual(['Stunde', 'Temperatur', 'Niederschlag']);
    const rows = Array.from(details.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(4);
    expect(rows[1].querySelector('th')?.textContent?.trim()).toBe('13:00');
    expect(rows[1].querySelectorAll('td')[0].textContent?.trim()).toBe('9,7 °C');
    expect(rows[2].querySelectorAll('td')[0].textContent?.trim()).toBe('–');
  });

  it('Vorhersage: Spalte Art, Chip, Legende; Kernaussage ohne Vorhersagewerte', async () => {
    stubChart();
    const { el } = await create({ data: DAY, predictionFromIndex: 2 });
    expect(el.querySelector('figcaption')?.textContent?.trim())
      .toBe('Bis jetzt: Temperatur von 8,0 °C bis 9,7 °C, Niederschlag zusammen 0,2 mm. Ab 14:00 Vorhersage.');
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows[1].textContent).toContain('Rückblick');
    expect(rows[2].querySelector('app-chip')?.textContent).toContain('Vorhersage');
    expect(el.querySelectorAll('.chart-legend li').length).toBe(3);
    expect(el.querySelector('canvas')?.getAttribute('aria-label')).toContain('ab 14:00 Vorhersage');
  });

  it('Vorhersage-Optik: Linie gestrichelt, Balken mit Rand ab dem Index', async () => {
    const { configs } = stubChart();
    await create({ data: DAY, predictionFromIndex: 2 });
    const [bar, line] = configs[0].data.datasets as unknown as Record<string, unknown>[];
    const dash = (line['segment'] as { borderDash: (ctx: { p1DataIndex: number }) => number[] | undefined }).borderDash;
    expect(dash({ p1DataIndex: 1 })).toBeUndefined();
    expect(dash({ p1DataIndex: 2 })).toEqual([6, 4]);
    const border = bar['borderWidth'] as (ctx: { dataIndex: number }) => number;
    expect(border({ dataIndex: 1 })).toBe(0);
    expect(border({ dataIndex: 3 })).toBe(1.5);
    expect(line['spanGaps']).toBe(false);
  });

  it('ungültiger Vorhersage-Index wird ignoriert', async () => {
    stubChart();
    const { el } = await create({ data: DAY, predictionFromIndex: 10 });
    expect(el.querySelectorAll('thead th').length).toBe(3);
    expect(el.querySelector('figcaption')?.textContent).not.toContain('Vorhersage');
  });

  it('neue Daten: chart.update() statt Neuaufbau (V23)', async () => {
    const { charts, create: createSpy } = stubChart();
    const { fixture } = await create({ data: DAY });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const next: ClimateChartDataset = { labels: ['1.', '2.', '3.'], temperatures: [1, null, 3], precipitations: [0, 0, null] };
    fixture.componentRef.setInput('data', next);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(charts[0].update).toHaveBeenCalled();
    expect(charts[0].destroy).not.toHaveBeenCalled();
    expect(charts[0].data.labels).toEqual(['1.', '2.', '3.']);
    expect(charts[0].data.datasets[1].data).toEqual([1, null, 3]);
  });

  it('Zerstören räumt das Diagramm ab', async () => {
    const { charts } = stubChart();
    const { fixture } = await create({ data: DAY });
    fixture.destroy();
    expect(charts[0].destroy).toHaveBeenCalled();
  });

  it('ohne Canvas-Kontext (jsdom) entsteht kein Diagramm, die Textalternative bleibt', async () => {
    const createSpy = vi.spyOn(ClimateChartComponent.prototype as unknown as { createChart: () => unknown }, 'createChart');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { el } = await create({ data: DAY });
    expect(createSpy).not.toHaveBeenCalled();
    expect(el.querySelectorAll('tbody tr').length).toBe(4);
  });
});
