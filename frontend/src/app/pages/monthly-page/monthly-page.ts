import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { berlinToday } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { monthViewTitle, setPageTitle } from '../../utils/page-title';
import { isValidMonthParam, isValidYearParam } from '../../utils/route-params';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const EMPTY_MESSAGE = 'Keine gespeicherten Daten für diesen Monat.';

@Component({
  selector: 'app-monthly-page',
  standalone: true,
  imports: [ClimateChartComponent, UnitPipe, RouterLink],
  templateUrl: './monthly-page.html',
  styleUrl: './monthly-page.css'
})
export class MonthlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);
  private today = berlinToday();
  readonly dataStartYear = DATA_START.slice(0, 4);

  /** Route-Parameter aus `/monat/:year/:month` (V08); auf `/monat` nicht gesetzt. */
  readonly year = input<string | undefined>();
  readonly month = input<string | undefined>();

  /** Auswahl, nur aus der URL abgeleitet; ohne Parameter der aktuelle Berliner Monat. */
  selectedYear = computed(() => this.year() ?? this.today.slice(0, 4));
  selectedMonth = computed(() => this.month() ?? this.today.slice(5, 7));
  /** Ungültiger Teil zeigt in seinem Select den Platzhalter „–“, der gültige Teil bleibt gewählt. */
  yearValid = computed(() => isValidYearParam(this.selectedYear(), this.today));
  monthValid = computed(() => isValidMonthParam(this.selectedMonth()));
  invalid = computed(() => !this.yearValid() || !this.monthValid());

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
    effect(() => setPageTitle(this.title, monthViewTitle(this.selectedYear(), this.selectedMonth())));

    // distinctUntilChanged: genau 1 Request je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) => a.year === b.year && a.month === b.month),
      switchMap(({ year, month }) => this.loadMonth(year, month)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  /** Auswahlfelder navigieren über den Router (V08); ein ungültiger Rest fällt auf den aktuellen Monat zurück. */
  onYearChange(event: Event): void {
    const month = this.monthValid() ? this.selectedMonth() : this.today.slice(5, 7);
    this.router.navigate(['/monat', (event.target as HTMLSelectElement).value, month]);
  }

  onMonthChange(event: Event): void {
    const year = this.yearValid() ? this.selectedYear() : this.today.slice(0, 4);
    this.router.navigate(['/monat', year, (event.target as HTMLSelectElement).value]);
  }

  private loadMonth(year: string, month: string): Observable<LoadResult<MonthSummary[]>> {
    // Ungültige Parameter lösen keinen Request aus
    if (!isValidYearParam(year, this.today) || !isValidMonthParam(month)) {
      return of<LoadResult<MonthSummary[]>>({ state: 'idle', data: null, message: null });
    }
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
