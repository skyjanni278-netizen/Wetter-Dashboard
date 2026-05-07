import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { WeatherService } from '../../services/weather.service';
import { YearSummary } from '../../models/weather';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

@Component({
  selector: 'app-yearly-page',
  standalone: true,
  imports: [FormsModule, ClimateChartComponent, DecimalPipe],
  templateUrl: './yearly-page.html',
  styleUrl: './yearly-page.css'
})
export class YearlyPageComponent implements OnInit {
  private weather = inject(WeatherService);

  selectedYear = signal(new Date().getFullYear().toString());
  yearData = signal<YearSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.yearData();
    if (data.length === 0) return null;
    return {
      labels: data.map(d => MONTH_NAMES[d.month - 1]),
      temperatures: data.map(d => d.avgTemp),
      precipitations: data.map(d => d.totalPrecip),
    };
  });

  totalPrecip = computed(() => this.yearData().reduce((s, d) => s + d.totalPrecip, 0));
  avgTemp = computed(() => {
    const data = this.yearData();
    if (data.length === 0) return null;
    return data.reduce((s, d) => s + d.avgTemp, 0) / data.length;
  });
  maxTemp = computed(() => this.yearData().length ? Math.max(...this.yearData().map(d => d.avgTemp)) : null);
  minTemp = computed(() => this.yearData().length ? Math.min(...this.yearData().map(d => d.avgTemp)) : null);

  ngOnInit(): void {
    this.loadData();
  }

  onYearChange(event: Event): void {
    this.selectedYear.set((event.target as HTMLSelectElement).value);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.weather.getYear(this.selectedYear()).subscribe({
      next: (res) => {
        this.yearData.set(res.data);
        this.loading.set(false);
        if (res.data.length === 0) {
          this.error.set('Keine gespeicherten Daten für dieses Jahr.');
        }
      },
      error: () => {
        this.error.set('Fehler beim Laden der Jahresdaten.');
        this.loading.set(false);
      }
    });
  }
}
