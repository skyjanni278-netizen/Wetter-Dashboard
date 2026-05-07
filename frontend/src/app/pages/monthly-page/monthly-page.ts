import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary } from '../../models/weather';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

@Component({
  selector: 'app-monthly-page',
  standalone: true,
  imports: [FormsModule, ClimateChartComponent, DecimalPipe],
  templateUrl: './monthly-page.html',
  styleUrl: './monthly-page.css'
})
export class MonthlyPageComponent implements OnInit {
  private weather = inject(WeatherService);

  selectedYear = signal(new Date().getFullYear().toString());
  selectedMonth = signal(String(new Date().getMonth() + 1).padStart(2, '0'));

  monthData = signal<MonthSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  monthName = computed(() => MONTH_NAMES[parseInt(this.selectedMonth(), 10) - 1]);

  years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
  months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MONTH_NAMES[i]
  }));

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.monthData();
    if (data.length === 0) return null;
    return {
      labels: data.map(d => `${d.day}.`),
      temperatures: data.map(d => d.avgTemp),
      precipitations: data.map(d => d.totalPrecip),
    };
  });

  totalPrecip = computed(() => this.monthData().reduce((s, d) => s + d.totalPrecip, 0));
  avgTemp = computed(() => {
    const data = this.monthData();
    if (data.length === 0) return null;
    return data.reduce((s, d) => s + d.avgTemp, 0) / data.length;
  });

  ngOnInit(): void {
    this.loadData();
  }

  onYearChange(event: Event): void {
    this.selectedYear.set((event.target as HTMLSelectElement).value);
    this.loadData();
  }

  onMonthChange(event: Event): void {
    this.selectedMonth.set((event.target as HTMLSelectElement).value);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.weather.getMonth(this.selectedYear(), this.selectedMonth()).subscribe({
      next: (res) => {
        this.monthData.set(res.data);
        this.loading.set(false);
        if (res.data.length === 0) {
          this.error.set('Keine gespeicherten Daten für diesen Monat.');
        }
      },
      error: () => {
        this.error.set('Fehler beim Laden der Monatsdaten.');
        this.loading.set(false);
      }
    });
  }
}
