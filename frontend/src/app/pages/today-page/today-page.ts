import { Component, OnInit, signal, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Observable, of, catchError, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { DayData, DayForecast } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { getWeatherIcon, describeWeather, getWindDirection } from '../../utils/weather-icon';
import { berlinToday, berlinHour, addDays, formatDateDe } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { longDateLabel, setPageTitle } from '../../utils/page-title';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

@Component({
  selector: 'app-today-page',
  standalone: true,
  imports: [DecimalPipe, UnitPipe, ClimateChartComponent],
  templateUrl: './today-page.html',
  styleUrl: './today-page.css'
})
export class TodayPageComponent implements OnInit {
  private weather = inject(WeatherService);
  private title = inject(Title);

  readonly getWeatherIcon = getWeatherIcon;
  readonly describeWeather = describeWeather;
  readonly getWindDirection = getWindDirection;

  selectedDate = signal(berlinToday());
  dayData = signal<DayData | null>(null);
  forecast = signal<DayForecast[]>([]);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

  /** Erhöht sich bei „Heute“ und „Erneut versuchen“, damit auch ohne Datumswechsel neu geladen wird. */
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

  /** Temperaturen ohne fehlende Werte (null), damit Min/Max nicht zu 0 werden (V13, F15). */
  private validTemps = computed(() =>
    (this.dayData()?.hourly ?? [])
      .map(h => h.temperature)
      .filter((t): t is number => t !== null && t !== undefined));

  dayMinTemp = computed(() => {
    const temps = this.validTemps();
    return temps.length ? Math.min(...temps) : null;
  });

  dayMaxTemp = computed(() => {
    const temps = this.validTemps();
    return temps.length ? Math.max(...temps) : null;
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
    effect(() => setPageTitle(this.title, 'Heute', longDateLabel(this.selectedDate())));

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

  retry(): void {
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
      catchError(err => of(this.errorResult(err, date))),
      startWith<LoadResult<DayData>>({ state: 'loading', data: null, message: null }),
    );
  }

  /** Meldung je nach Ursache (V20). */
  private errorResult(err: { status?: number; error?: { error?: string } }, date: string): LoadResult<DayData> {
    if (err?.status === 404) {
      const message = date < DATA_START
        ? `Für den ${formatDateDe(date)} liegen keine Daten vor. Daten gibt es ab dem ${formatDateDe(DATA_START)}.`
        : (err?.error?.error ?? 'Keine Daten für diesen Tag gefunden.');
      return { state: 'empty', data: null, message };
    }
    if (!err?.status || err.status >= 500) {
      return { state: 'error', data: null, message: 'Server nicht erreichbar.' };
    }
    return { state: 'error', data: null, message: err?.error?.error ?? 'Fehler beim Laden.' };
  }

  private applyResult(result: LoadResult<DayData>): void {
    this.state.set(result.state);
    this.error.set(result.message);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F03)
    if (result.state !== 'loading') this.dayData.set(result.data);
  }
}
