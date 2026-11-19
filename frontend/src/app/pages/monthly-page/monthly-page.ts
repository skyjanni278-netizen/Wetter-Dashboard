import { Component, signal, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Observable, of, catchError, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { berlinToday } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { monthLabel, setPageTitle } from '../../utils/page-title';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const EMPTY_MESSAGE = 'Keine gespeicherten Daten für diesen Monat.';

@Component({
  selector: 'app-monthly-page',
  standalone: true,
  imports: [ClimateChartComponent, UnitPipe],
  templateUrl: './monthly-page.html',
  styleUrl: './monthly-page.css'
})
export class MonthlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private today = berlinToday();

  selectedYear = signal(this.today.slice(0, 4));
  selectedMonth = signal(this.today.slice(5, 7));

  monthData = signal<MonthSummary[] | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

  private request = computed(() => ({ year: this.selectedYear(), month: this.selectedMonth() }));

  monthName = computed(() => MONTH_NAMES[parseInt(this.selectedMonth(), 10) - 1]);

  /** Jahre von DATA_START bis zum aktuellen Berliner Jahr, neuestes zuerst (V18, F20). */
  years = Array.from(
    { length: parseInt(this.today.slice(0, 4), 10) - parseInt(DATA_START.slice(0, 4), 10) + 1 },
    (_, i) => (parseInt(this.today.slice(0, 4), 10) - i).toString(),
  );
  months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MONTH_NAMES[i]
  }));

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.monthData();
    if (!data || data.length === 0) return null;
    return {
      labels: data.map(d => `${d.day}.`),
      temperatures: data.map(d => d.avgTemp),
      precipitations: data.map(d => d.totalPrecip),
    };
  });

  totalPrecip = computed(() => (this.monthData() ?? []).reduce((s, d) => s + d.totalPrecip, 0));
  avgTemp = computed(() => {
    const data = this.monthData();
    if (!data || data.length === 0) return null;
    return data.reduce((s, d) => s + d.avgTemp, 0) / data.length;
  });

  constructor() {
    effect(() => setPageTitle(this.title, 'Monat', monthLabel(this.selectedYear(), this.selectedMonth())));

    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04)
    toObservable(this.request).pipe(
      switchMap(({ year, month }) => this.loadMonth(year, month)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  onYearChange(event: Event): void {
    this.selectedYear.set((event.target as HTMLSelectElement).value);
  }

  onMonthChange(event: Event): void {
    this.selectedMonth.set((event.target as HTMLSelectElement).value);
  }

  private loadMonth(year: string, month: string): Observable<LoadResult<MonthSummary[]>> {
    return this.weather.getMonth(year, month).pipe(
      map((res): LoadResult<MonthSummary[]> => res.data.length > 0
        ? { state: 'success', data: res.data, message: null }
        : { state: 'empty', data: null, message: EMPTY_MESSAGE }),
      catchError(err => of<LoadResult<MonthSummary[]>>(err?.status === 404
        ? { state: 'empty', data: null, message: EMPTY_MESSAGE }
        : { state: 'error', data: null, message: 'Fehler beim Laden der Monatsdaten.' })),
      startWith<LoadResult<MonthSummary[]>>({ state: 'loading', data: null, message: null }),
    );
  }

  private applyResult(result: LoadResult<MonthSummary[]>): void {
    this.state.set(result.state);
    this.error.set(result.message);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F12)
    if (result.state !== 'loading') this.monthData.set(result.data);
  }
}
