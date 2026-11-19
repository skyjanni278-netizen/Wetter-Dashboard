import { Component, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Observable, of, catchError, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { YearSummary } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { berlinToday } from '../../utils/berlin-date';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const EMPTY_MESSAGE = 'Keine gespeicherten Daten für dieses Jahr.';

@Component({
  selector: 'app-yearly-page',
  standalone: true,
  imports: [FormsModule, ClimateChartComponent, DecimalPipe],
  templateUrl: './yearly-page.html',
  styleUrl: './yearly-page.css'
})
export class YearlyPageComponent {
  private weather = inject(WeatherService);
  private currentYear = berlinToday().slice(0, 4);

  selectedYear = signal(this.currentYear);
  yearData = signal<YearSummary[] | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

  /** Erhöht sich bei „Laden“, damit auch ohne Auswahlwechsel neu geladen wird. */
  private reloadCount = signal(0);
  private request = computed(() => ({ year: this.selectedYear(), reload: this.reloadCount() }));

  years = Array.from({ length: 5 }, (_, i) => (parseInt(this.currentYear, 10) - i).toString());

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.yearData();
    if (!data || data.length === 0) return null;
    return {
      labels: data.map(d => MONTH_NAMES[d.month - 1]),
      temperatures: data.map(d => d.avgTemp),
      precipitations: data.map(d => d.totalPrecip),
    };
  });

  totalPrecip = computed(() => (this.yearData() ?? []).reduce((s, d) => s + d.totalPrecip, 0));
  avgTemp = computed(() => {
    const data = this.yearData();
    if (!data || data.length === 0) return null;
    return data.reduce((s, d) => s + d.avgTemp, 0) / data.length;
  });
  maxTemp = computed(() => {
    const data = this.yearData();
    return data && data.length ? Math.max(...data.map(d => d.avgTemp)) : null;
  });
  minTemp = computed(() => {
    const data = this.yearData();
    return data && data.length ? Math.min(...data.map(d => d.avgTemp)) : null;
  });

  constructor() {
    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04)
    toObservable(this.request).pipe(
      switchMap(({ year }) => this.loadYear(year)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  onYearChange(event: Event): void {
    this.selectedYear.set((event.target as HTMLSelectElement).value);
  }

  loadData(): void {
    this.reloadCount.update(n => n + 1);
  }

  private loadYear(year: string): Observable<LoadResult<YearSummary[]>> {
    return this.weather.getYear(year).pipe(
      map((res): LoadResult<YearSummary[]> => res.data.length > 0
        ? { state: 'success', data: res.data, message: null }
        : { state: 'empty', data: null, message: EMPTY_MESSAGE }),
      catchError(err => of<LoadResult<YearSummary[]>>(err?.status === 404
        ? { state: 'empty', data: null, message: EMPTY_MESSAGE }
        : { state: 'error', data: null, message: 'Fehler beim Laden der Jahresdaten.' })),
      startWith<LoadResult<YearSummary[]>>({ state: 'loading', data: null, message: null }),
    );
  }

  private applyResult(result: LoadResult<YearSummary[]>): void {
    this.state.set(result.state);
    this.error.set(result.message);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F12)
    if (result.state !== 'loading') this.yearData.set(result.data);
  }
}
