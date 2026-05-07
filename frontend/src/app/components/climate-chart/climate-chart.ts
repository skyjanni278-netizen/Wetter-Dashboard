import {
  Component, Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, AfterViewInit, OnDestroy
} from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface ClimateChartDataset {
  labels: string[];
  temperatures: number[];
  precipitations: number[];
}

@Component({
  selector: 'app-climate-chart',
  standalone: true,
  imports: [],
  templateUrl: './climate-chart.html',
  styleUrl: './climate-chart.css'
})
export class ClimateChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: ClimateChartDataset | null = null;
  @Input() title = '';
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void {
    this.buildChart();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.chart && this.data) {
      this.chart.destroy();
      this.chart = null;
      this.buildChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildChart(): void {
    if (!this.canvasRef || !this.data) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = this.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [
          {
            type: 'bar',
            label: 'Niederschlag (mm)',
            data: d.precipitations,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Temperatur (°C)',
            data: d.temperatures,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.3,
            fill: false,
            yAxisID: 'y2',
            order: 1,
          },
        ],
      },
      options: {
        animation: { duration: reducedMotion ? 0 : 400 },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: !!this.title, text: this.title, font: { size: 16 } },
          legend: { position: 'top' },
        },
        scales: {
          x: { grid: { color: '#e0e0e0' } },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Niederschlag (mm)' },
            grid: { color: '#e0e0e0' },
            min: 0,
          },
          y2: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Temperatur (°C)' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
}
