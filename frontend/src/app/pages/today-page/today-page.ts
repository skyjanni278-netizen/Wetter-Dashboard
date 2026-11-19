import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Observable, of, catchError, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { DayData, DayForecast } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { getWeatherIcon, getWeatherDescription, getWindDirection } from '../../utils/weather-icon';
import { berlinToday, berlinHour, addDays } from '../../utils/berlin-date';

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

  selectedDate = signal(berlinToday());
  dayData = signal<DayData | null>(null);
  forecast = signal<DayForecast[]>([]);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

  /** Erhöht sich bei „Heute“, damit auch ohne Datumswechsel neu geladen wird. */
  private reloadCount = signal(0);
  private request = computed(() => ({ date: this.selectedDate(), reload: this.reloadCount() }));

  isToday  = computed(() => this.selectedDate() === berlinToday());
  isFuture = computed(() => this.selectedDate() >   berlinToday());

  currentHourEntry = computed(() => {
    const data = this.dayData();
    if (!data || !this.isToday()) return null;
    const currentHour = `${data.date}T${String(berlinHour()).padStart(2, '0')}:00`;
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
      isToday: f.date === berlinToday(),
    }))
  );

  constructor() {
    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04)
    toObservable(this.request).pipe(
      switchMap(({ date }) => this.loadDay(date)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  ngOnInit(): void {
    this.weather.getForecast().subscribe({ next: f => this.forecast.set(f), error: () => {} });
  }

  onDateChange(event: Event): void {
    const date = (event.target as HTMLInputElement).value;
    this.selectedDate.set(date);
  }

  loadToday(): void {
    this.selectedDate.set(berlinToday());
    this.reloadCount.update(n => n + 1);
  }

  loadPreviousDay(): void {
    this.selectedDate.set(addDays(this.selectedDate(), -1));
  }

  loadNextDay(): void {
    const date = addDays(this.selectedDate(), 1);
    if (date > berlinToday()) return;
    this.selectedDate.set(date);
  }

  private loadDay(date: string): Observable<LoadResult<DayData>> {
    const today = berlinToday();
    if (date > today) {
      return of<LoadResult<DayData>>({ state: 'idle', data: null, message: null });
    }
    const obs = date === today
      ? this.weather.getToday()
      : this.weather.getDay(date);
    return obs.pipe(
      map((data): LoadResult<DayData> => data?.hourly?.length
        ? { state: 'success', data, message: null }
        : { state: 'empty', data: null, message: 'Keine Daten für diesen Tag gefunden.' }),
      catchError(err => of<LoadResult<DayData>>(err?.status === 404
        ? { state: 'empty', data: null, message: err?.error?.error ?? 'Keine Daten für diesen Tag gefunden.' }
        : { state: 'error', data: null, message: err?.error?.error ?? 'Fehler beim Laden.' })),
      startWith<LoadResult<DayData>>({ state: 'loading', data: null, message: null }),
    );
  }

  private applyResult(result: LoadResult<DayData>): void {
    this.state.set(result.state);
    this.error.set(result.message);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F03)
    if (result.state !== 'loading') this.dayData.set(result.data);
  }
}
