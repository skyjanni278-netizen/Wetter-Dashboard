import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { YearSummary } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { berlinToday } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { setPageTitle, yearViewTitle } from '../../utils/page-title';
import { isValidYearParam } from '../../utils/route-params';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const EMPTY_MESSAGE = 'Keine gespeicherten Daten für dieses Jahr.';

@Component({
  selector: 'app-yearly-page',
  standalone: true,
  imports: [ClimateChartComponent, UnitPipe, RouterLink],
  templateUrl: './yearly-page.html',
  styleUrl: './yearly-page.css'
})
export class YearlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);
  private today = berlinToday();
  private currentYear = this.today.slice(0, 4);
  readonly dataStartYear = DATA_START.slice(0, 4);

  /** Route-Parameter aus `/jahr/:year` (V08); auf `/jahr` nicht gesetzt. */
  readonly year = input<string | undefined>();

  /** Auswahl, nur aus der URL abgeleitet; ohne Parameter das aktuelle Berliner Jahr. */
  selectedYear = computed(() => this.year() ?? this.currentYear);
  invalid = computed(() => !isValidYearParam(this.selectedYear(), this.today));
  yearData = signal<YearSummary[] | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

  private request = computed(() => ({ year: this.selectedYear() }));

  /** Jahre von DATA_START bis zum aktuellen Berliner Jahr, neuestes zuerst (V18, F20). */
  years = Array.from(
    { length: parseInt(this.currentYear, 10) - parseInt(DATA_START.slice(0, 4), 10) + 1 },
    (_, i) => (parseInt(this.currentYear, 10) - i).toString(),
  );

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
    effect(() => setPageTitle(this.title, yearViewTitle(this.selectedYear())));

    // distinctUntilChanged: genau 1 Request je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) => a.year === b.year),
      switchMap(({ year }) => this.loadYear(year)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  /** Auswahlfeld navigiert über den Router (V08). */
  onYearChange(event: Event): void {
    this.router.navigate(['/jahr', (event.target as HTMLSelectElement).value]);
  }

  private loadYear(year: string): Observable<LoadResult<YearSummary[]>> {
    // Ungültige Parameter lösen keinen Request aus
    if (!isValidYearParam(year, this.today)) {
      return of<LoadResult<YearSummary[]>>({ state: 'idle', data: null, message: null });
    }
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
