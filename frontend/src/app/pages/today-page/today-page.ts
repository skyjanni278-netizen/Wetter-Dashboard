import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { WeatherService } from '../../services/weather.service';
import { DayData, DayForecast } from '../../models/weather';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { getWeatherIcon, getWeatherDescription, getWindDirection } from '../../utils/weather-icon';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

@Component({
  selector: 'app-today-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ClimateChartComponent],
  templateUrl: './today-page.html',
  styleUrl: './today-page.css'
})
export class TodayPageComponent implements OnInit {
  private weather = inject(WeatherService);

  readonly getWeatherIcon = getWeatherIcon;
  readonly getWeatherDescription = getWeatherDescription;
  readonly getWindDirection = getWindDirection;

  selectedDate = signal(new Date().toISOString().slice(0, 10));
  dayData = signal<DayData | null>(null);
  forecast = signal<DayForecast[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  isToday = computed(() => this.selectedDate() === new Date().toISOString().slice(0, 10));

  currentHourEntry = computed(() => {
    const data = this.dayData();
    if (!data || !this.isToday()) return null;
    const currentHour = `${data.date}T${String(new Date().getHours()).padStart(2, '0')}:00`;
    return data.hourly.find(h => h.time === currentHour) ?? data.hourly[data.hourly.length - 1];
  });

  noonHourEntry = computed(() => {
    const data = this.dayData();
    if (!data) return null;
    return data.hourly.find(h => h.time.endsWith('T12:00')) ?? data.hourly[Math.floor(data.hourly.length / 2)];
  });

  dayMinTemp = computed(() => {
    const data = this.dayData();
    if (!data) return null;
    return Math.min(...data.hourly.map(h => h.temperature));
  });

  dayMaxTemp = computed(() => {
    const data = this.dayData();
    if (!data) return null;
    return Math.max(...data.hourly.map(h => h.temperature));
  });

  dayTempRange = computed(() => {
    const min = this.dayMinTemp();
    const max = this.dayMaxTemp();
    if (min === null || max === null) return null;
    return Math.round((max - min) * 10) / 10;
  });

  totalDayPrecip = computed(() => {
    const data = this.dayData();
    if (!data) return 0;
    return Math.round(data.hourly.reduce((s, h) => s + (h.precipitation ?? 0), 0) * 10) / 10;
  });

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.dayData();
    if (!data) return null;
    return {
      labels: data.hourly.map(h => h.time.slice(11, 16)),
      temperatures: data.hourly.map(h => h.temperature),
      precipitations: data.hourly.map(h => h.precipitation),
    };
  });

  forecastWithMeta = computed(() =>
    this.forecast().map(f => ({
      ...f,
      dayName: DAY_NAMES[new Date(f.date + 'T12:00:00').getDay()],
      isToday: f.date === new Date().toISOString().slice(0, 10),
    }))
  );

  ngOnInit(): void {
    this.loadData(this.selectedDate());
    this.weather.getForecast().subscribe({ next: f => this.forecast.set(f), error: () => {} });
  }

  onDateChange(event: Event): void {
    const date = (event.target as HTMLInputElement).value;
    this.selectedDate.set(date);
    this.loadData(date);
  }

  loadToday(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.selectedDate.set(today);
    this.loadData(today);
  }

  private loadData(date: string): void {
    this.loading.set(true);
    this.error.set(null);
    const obs = date === new Date().toISOString().slice(0, 10)
      ? this.weather.getToday()
      : this.weather.getDay(date);
    obs.subscribe({
      next: data => { this.dayData.set(data); this.loading.set(false); },
      error: err => { this.error.set(err?.error?.error ?? 'Fehler beim Laden.'); this.loading.set(false); }
    });
  }
}
