import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input,
  untracked, viewChild,
} from '@angular/core';
import {
  BarController, BarElement, CategoryScale, Chart, ChartConfiguration, LineController, LineElement,
  LinearScale, Plugin, PointElement, ScriptableContext, ScriptableLineSegmentContext, Tooltip,
} from 'chart.js';
import { DataTableColumn, DataTableComponent, DataTableRow } from '../data-table/data-table';

// Nur die benötigten Teile (V23). Keine Chart.js-Legende und kein Titel-Plugin:
// Legende und Überschrift stehen als HTML in der Vorlage (V07, E3.8).
Chart.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

export interface ClimateChartDataset {
  labels: string[];
  /** `null` = keine Daten; die Linie ist an dieser Stelle unterbrochen (V21). */
  temperatures: (number | null)[];
  precipitations: (number | null)[];
}

type ChartKind = 'bar' | 'line';
type Values = (number | null)[];

const TEMP_FORMAT = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PRECIP_FORMAT = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Rundung erst bei der Ausgabe. */
function formatTemp(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : `${TEMP_FORMAT.format(value)} °C`;
}
function formatPrecip(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : `${PRECIP_FORMAT.format(value)} mm`;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/** Schmale Diagramme (mobil): höchstens 6 Beschriftungen auf der x-Achse (E3.8). */
const NARROW_WIDTH = 560;

/**
 * Klimadiagramm (E3.7.10, E3.8): Temperatur als Linie, Niederschlag als Balken.
 *
 * - `<figure>` mit `<figcaption>` (Kernaussage), Canvas mit `role="img"` und `aria-label`,
 *   HTML-Legende und Datentabelle „Werte als Tabelle“ in `<details>` (V07, F17).
 * - Farben, Schrift und Strichelung kommen zur Laufzeit aus den Tokens.
 * - Bei neuen Daten wird das Diagramm mit `chart.update()` aktualisiert, nicht neu gebaut (V23).
 * - `null`-Werte erzeugen Lücken (V21). Einzelne Werte zwischen Lücken erhalten einen Punkt.
 * - Ab `predictionFromIndex` gilt Vorhersage: Linie gestrichelt, Balken schraffiert, Band
 *   „Vorhersage“ und Linie „Jetzt“. Vorhersagewerte zählen nicht in die Kernaussage.
 */
@Component({
  selector: 'app-climate-chart',
  imports: [DataTableComponent],
  templateUrl: './climate-chart.html',
  styleUrl: './climate-chart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClimateChartComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly data = input<ClimateChartDataset | null>(null);
  /** Optionale Überschrift (h2) im `<figure>`. */
  readonly title = input('');
  /** Eigene Kernaussage; ohne Angabe wird sie aus den Daten gebildet. */
  readonly caption = input<string | null>(null);
  /** Kopf der ersten Tabellenspalte: „Stunde“, „Tag“ oder „Monat“. */
  readonly labelHeading = input('Zeitpunkt');
  /** Erster Index mit Vorhersagewerten; `null` = keine Vorhersage im Diagramm. */
  readonly predictionFromIndex = input<number | null>(null);

  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: Chart<ChartKind, Values, string> | null = null;
  private colors: ReturnType<ClimateChartComponent['readTokens']> | null = null;

  /** Vorhersage-Index im gültigen Bereich (0 … Anzahl), sonst `null`. */
  readonly predictionFrom = computed(() => {
    const p = this.predictionFromIndex();
    const n = this.data()?.labels.length ?? 0;
    if (p === null || !Number.isInteger(p) || p < 0 || p >= n) return null;
    return p;
  });
  readonly hasPrediction = computed(() => this.predictionFrom() !== null);

  /** Werte ohne Vorhersage (für Kernaussage und Bereichsangaben). */
  private observed = computed(() => {
    const d = this.data();
    if (!d) return { temps: [] as number[], precip: [] as number[] };
    const end = this.predictionFrom() ?? d.labels.length;
    return {
      temps: d.temperatures.slice(0, end).filter(isNumber),
      precip: d.precipitations.slice(0, end).filter(isNumber),
    };
  });

  readonly captionText = computed(() => {
    const own = this.caption();
    if (own) return own;
    const d = this.data();
    if (!d || d.labels.length === 0) return 'Keine Werte vorhanden.';
    const { temps, precip } = this.observed();
    const p = this.predictionFrom();
    const parts: string[] = [];
    const prefix = p !== null ? 'Bis jetzt: ' : '';
    parts.push(temps.length
      ? `${prefix}Temperatur von ${formatTemp(Math.min(...temps))} bis ${formatTemp(Math.max(...temps))}`
      : `${prefix}keine Temperaturwerte`);
    parts.push(precip.length
      ? `Niederschlag zusammen ${formatPrecip(precip.reduce((s, v) => s + v, 0))}`
      : 'keine Niederschlagswerte');
    let text = parts.join(', ') + '.';
    if (p !== null) text += ` Ab ${d.labels[p]} Vorhersage.`;
    return text;
  });

  readonly ariaLabel = computed(() => {
    const d = this.data();
    const name = this.title() || 'Temperatur und Niederschlag';
    if (!d || d.labels.length === 0) return `Diagramm ${name}: keine Werte.`;
    const range = `${d.labels[0]} bis ${d.labels[d.labels.length - 1]}`;
    const p = this.predictionFrom();
    const forecast = p !== null ? `, ab ${d.labels[p]} Vorhersage` : '';
    return `Diagramm ${name}, ${range}: Temperatur als Linie, Niederschlag als Balken${forecast}. `
      + `${this.captionText()} Alle Werte in der Tabelle „Werte als Tabelle“.`;
  });

  readonly tableColumns = computed<DataTableColumn[]>(() => {
    const columns: DataTableColumn[] = [
      { key: 'label', label: this.labelHeading(), rowHeader: true },
      { key: 'temperature', label: 'Temperatur', align: 'end' },
      { key: 'precipitation', label: 'Niederschlag', align: 'end' },
    ];
    if (this.hasPrediction()) columns.push({ key: 'kind', label: 'Art' });
    return columns;
  });

  readonly tableRows = computed<DataTableRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const p = this.predictionFrom();
    return d.labels.map((label, i) => ({
      label,
      temperature: formatTemp(d.temperatures[i]),
      precipitation: formatPrecip(d.precipitations[i]),
      ...(p !== null ? { kind: i >= p ? { chip: 'Vorhersage', variant: 'forecast' as const } : 'Rückblick' } : {}),
    }));
  });

  readonly tableCaption = computed(() => `Werte: ${this.title() || 'Temperatur und Niederschlag'}`);

  constructor() {
    afterRenderEffect({
      write: () => {
        const data = this.data();
        const prediction = this.predictionFrom();
        untracked(() => this.render(data, prediction));
      },
    });
    inject(DestroyRef).onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private render(data: ClimateChartDataset | null, prediction: number | null): void {
    if (!data) {
      this.chart?.destroy();
      this.chart = null;
      return;
    }
    if (!this.chart) {
      this.build(data);
      return;
    }
    // Daten an Ort und Stelle tauschen (V02, V23). Die Callbacks lesen predictionFrom() neu.
    this.chart.data.labels = [...data.labels];
    this.chart.data.datasets[0].data = [...data.precipitations];
    this.chart.data.datasets[1].data = [...data.temperatures];
    this.applyLayout(this.chart, prediction);
    this.chart.update();
  }

  /** Erzeugt das Chart-Objekt; eigene Methode, damit Tests sie ersetzen können. */
  protected createChart(canvas: HTMLCanvasElement, config: ChartConfiguration<ChartKind, Values, string>): Chart<ChartKind, Values, string> {
    return new Chart(canvas, config);
  }

  private readTokens() {
    const css = getComputedStyle(this.host.nativeElement);
    const token = (name: string): string => css.getPropertyValue(name).trim();
    return {
      temp: token('--chart-temp'),
      precip: token('--chart-precip'),
      band: token('--chart-forecast-band'),
      dash: token('--chart-forecast-dash').split(/\s+/).map(Number).filter(n => Number.isFinite(n) && n > 0),
      grid: token('--chart-grid'),
      axis: token('--chart-axis'),
      now: token('--chart-now'),
      tooltipBg: token('--chart-tooltip-bg'),
      tooltipText: token('--chart-tooltip-text'),
      surface: token('--color-surface'),
      subtle: token('--color-text-subtle'),
      font: token('--font-body'),
    };
  }

  /** Diagonale Schraffur für Vorhersagebalken: Linien `--chart-precip` auf `--color-surface`. */
  private hatchPattern(colors: ReturnType<ClimateChartComponent['readTokens']>): CanvasPattern | string {
    const tile = document.createElement('canvas');
    tile.width = 8;
    tile.height = 8;
    const ctx = tile.getContext('2d');
    if (!ctx) return colors.band;
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = colors.precip;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2);
    ctx.lineTo(2, -2);
    ctx.moveTo(6, 10);
    ctx.lineTo(10, 6);
    ctx.stroke();
    return ctx.createPattern(tile, 'repeat') ?? colors.band;
  }

  private isPrediction(index: number): boolean {
    const p = this.predictionFrom();
    return p !== null && index >= p;
  }

  /** Einzelner Wert zwischen zwei Lücken: ohne Punkt wäre er unsichtbar. */
  private isIsolated(values: Values, index: number): boolean {
    if (!isNumber(values[index])) return false;
    return !isNumber(values[index - 1]) && !isNumber(values[index + 1]);
  }

  /** Platz über der Plotfläche für die Beschriftungen „Jetzt …“ und „Vorhersage“. */
  private layoutFor(prediction: number | null) {
    return { padding: { top: prediction !== null ? 20 : 0 } };
  }

  private applyLayout(chart: Chart<ChartKind, Values, string>, prediction: number | null): void {
    chart.options.layout = this.layoutFor(prediction);
  }

  private applyTickLimit(chart: Chart<ChartKind, Values, string>, width: number): void {
    const x = chart.options.scales?.['x'];
    if (x?.ticks) x.ticks.maxTicksLimit = width < NARROW_WIDTH ? 6 : 12;
  }

  private build(data: ClimateChartDataset): void {
    const canvas = this.canvasRef().nativeElement;
    if (!canvas.getContext('2d')) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const c = this.colors ??= this.readTokens();
    const pattern = this.hatchPattern(c);
    const dash = c.dash.length ? c.dash : [6, 4];
    const narrow = (canvas.parentElement?.clientWidth ?? 1000) < NARROW_WIDTH;

    Chart.defaults.font.family = c.font || Chart.defaults.font.family;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = c.axis;

    const config: ChartConfiguration<ChartKind, Values, string> = {
      type: 'bar',
      data: {
        labels: [...data.labels],
        datasets: [
          {
            type: 'bar',
            label: 'Niederschlag',
            data: [...data.precipitations],
            backgroundColor: (ctx: ScriptableContext<'bar'>) => this.isPrediction(ctx.dataIndex) ? pattern : c.precip,
            borderColor: c.precip,
            borderWidth: (ctx: ScriptableContext<'bar'>) => this.isPrediction(ctx.dataIndex) ? 1.5 : 0,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Temperatur',
            data: [...data.temperatures],
            borderColor: c.temp,
            backgroundColor: c.temp,
            borderWidth: 2,
            pointRadius: (ctx: ScriptableContext<'line'>) =>
              this.isIsolated(ctx.dataset.data as Values, ctx.dataIndex) ? 3 : 0,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: false,
            spanGaps: false,
            segment: {
              borderDash: (ctx: ScriptableLineSegmentContext) => this.isPrediction(ctx.p1DataIndex) ? dash : undefined,
            },
            yAxisID: 'y2',
            order: 1,
          },
        ],
      },
      options: {
        animation: reducedMotion ? false : { duration: 400 },
        locale: 'de-DE',
        layout: this.layoutFor(this.predictionFrom()),
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onResize: (chart, size) => this.applyTickLimit(chart as Chart<ChartKind, Values, string>, size.width),
        plugins: {
          tooltip: {
            backgroundColor: c.tooltipBg,
            titleColor: c.tooltipText,
            bodyColor: c.tooltipText,
            cornerRadius: 8,
            callbacks: {
              title: items => {
                const item = items[0];
                if (!item) return '';
                return this.isPrediction(item.dataIndex) ? `${item.label} (Vorhersage)` : item.label;
              },
              label: item => item.datasetIndex === 0
                ? `Niederschlag: ${formatPrecip(item.parsed.y)}`
                : `Temperatur: ${formatTemp(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: c.axis },
            ticks: { color: c.axis, maxRotation: 0, autoSkip: true, maxTicksLimit: narrow ? 6 : 12 },
          },
          y: {
            type: 'linear',
            position: 'left',
            min: 0,
            title: { display: true, text: 'Niederschlag (mm)', color: c.axis },
            grid: { color: c.grid },
            border: { color: c.axis },
            ticks: { color: c.axis },
          },
          y2: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Temperatur (°C)', color: c.axis },
            grid: { drawOnChartArea: false },
            border: { color: c.axis },
            ticks: { color: c.axis },
          },
        },
      },
      plugins: [this.forecastPlugin(c)],
    };

    this.chart = this.createChart(canvas, config);
  }

  /**
   * Band „Vorhersage“ hinter den Daten ab der Stunde „jetzt“ und senkrechte Linie „Jetzt …“
   * (E3.8). Das Band ist Deko; die Information tragen Beschriftung, Strichelung und Schraffur.
   */
  private forecastPlugin(c: ReturnType<ClimateChartComponent['readTokens']>): Plugin<ChartKind> {
    const position = (chart: Chart<ChartKind>): { x: number; nowLabel: string | null } | null => {
      const p = this.predictionFrom();
      const labels = chart.data.labels as string[] | undefined;
      const x = chart.scales['x'];
      if (p === null || !x || !labels || p >= labels.length) return null;
      if (p === 0) return { x: chart.chartArea.left, nowLabel: null };
      return { x: x.getPixelForValue(p - 1), nowLabel: labels[p - 1] ?? null };
    };

    return {
      id: 'forecastBand',
      beforeDatasetsDraw: chart => {
        const pos = position(chart);
        if (!pos) return;
        const { top, bottom, right } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = c.band;
        ctx.fillRect(pos.x, top, right - pos.x, bottom - top);
        ctx.restore();
      },
      afterDatasetsDraw: chart => {
        const pos = position(chart);
        if (!pos) return;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = `12px ${c.font || 'sans-serif'}`;
        ctx.textBaseline = 'bottom';
        const forecastText = 'Vorhersage';
        // Schmale Diagramme: rechts vom Band ist kein Platz, dann steht alles links der Linie
        const fitsRight = pos.x + 4 + ctx.measureText(forecastText).width <= chart.width;
        if (fitsRight) {
          ctx.fillStyle = c.subtle;
          ctx.textAlign = 'left';
          ctx.fillText(forecastText, pos.x + 4, top - 4);
        }
        if (pos.nowLabel) {
          ctx.strokeStyle = c.now;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(pos.x) + 0.5, top);
          ctx.lineTo(Math.round(pos.x) + 0.5, bottom);
          ctx.stroke();
          const text = fitsRight ? `Jetzt ${pos.nowLabel}` : `Jetzt ${pos.nowLabel} · danach Vorhersage`;
          ctx.fillStyle = c.now;
          ctx.textAlign = 'right';
          ctx.fillText(text, Math.max(pos.x - 4, ctx.measureText(text).width), top - 4);
        } else if (!fitsRight) {
          ctx.fillStyle = c.subtle;
          ctx.textAlign = 'right';
          ctx.fillText(forecastText, chart.width - 2, top - 4);
        }
        ctx.restore();
      },
    };
  }
}
