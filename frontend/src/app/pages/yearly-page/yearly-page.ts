import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, forkJoin, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary, YearList, YearSummary } from '../../models/api';
import { LoadResult, LoadState } from '../../models/load-state';
import { apiErrorOf } from '../../interceptors/api-error.interceptor';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { berlinToday } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { CardComponent } from '../../components/card/card';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card';
import { ChipComponent } from '../../components/chip/chip';
import { NoticeComponent } from '../../components/notice/notice';
import { FormFieldComponent } from '../../components/form-field/form-field';
import { SkeletonComponent } from '../../components/skeleton/skeleton';
import { LoadingComponent } from '../../components/state/loading';
import { EmptyComponent } from '../../components/state/empty';
import { ErrorComponent } from '../../components/state/error';
import { MONTH_LONG, setPageTitle, yearViewTitle } from '../../utils/page-title';
import { isValidYearParam } from '../../utils/route-params';
import { yearOptions } from '../../utils/year-options';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const YEAR_EMPTY_MESSAGE = 'Keine gespeicherten Daten für dieses Jahr.';
export const YEAR_ERROR_MESSAGE = 'Fehler beim Laden der Jahresdaten.';

/** Daten eines Jahres: Jahreszusammenfassung (Kennzahlen) und Monatszusammenfassungen (Diagramm), S8. */
export interface YearData {
  summary: YearSummary;
  months: MonthSummary[];
}

interface YearResult extends LoadResult<YearData> {
  /** „Erneut versuchen“ anbieten; nicht bei 400 (dieselbe Anfrage scheitert wieder). */
  retryable: boolean;
}

@Component({
  selector: 'app-yearly-page',
  standalone: true,
  imports: [
    ClimateChartComponent, RouterLink, CardComponent, KpiCardComponent, ChipComponent, NoticeComponent, FormFieldComponent,
    SkeletonComponent, LoadingComponent, EmptyComponent, ErrorComponent,
  ],
  templateUrl: './yearly-page.html',
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
  yearData = signal<YearData | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);
  retryable = signal(true);

  /** „Erneut versuchen“ erhöht den Zähler und lädt dasselbe Jahr neu (B5.2). */
  private reloadCount = signal(0);
  private request = computed(() => ({ year: this.selectedYear(), reload: this.reloadCount() }));

  /** Jahre aus `GET /api/summaries/years` (F20), einmal je Seitenaufruf geladen; neuestes zuerst. */
  private yearList = signal<YearList | null>(null);
  years = computed(() => yearOptions(this.yearList(), this.invalid() ? null : this.selectedYear(), this.today));

  /** Kennzahlen aus der Jahreszusammenfassung: Ø nach R12 aus der API, nicht Mittel der Monatsmittel (F28). */
  summary = computed(() => this.yearData()?.summary ?? null);

  /** Volle Jahresachse Jan–Dez; Monate ohne Zusammenfassung sind `null` und zeigen eine Lücke (V21). */
  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.yearData();
    if (!data) return null;
    const byMonth = new Map(data.months.map(m => [m.month, m]));
    const axis = Array.from({ length: 12 }, (_, i) => i + 1);
    return {
      labels: axis.map(month => MONTH_NAMES[month - 1]),
      temperatures: axis.map(month => byMonth.get(month)?.temperature.mean ?? null),
      precipitations: axis.map(month => byMonth.get(month)?.precipitationSum ?? null),
    };
  });

  /** Monat mit dem höchsten bzw. niedrigsten Monatsmittel der API (Auswahl, keine Rechnung); früherer Monat bei Gleichstand. */
  warmestMonth = computed(() => this.extremeMonth((a, b) => a > b));
  coldestMonth = computed(() => this.extremeMonth((a, b) => a < b));
  maxTemp = computed(() => this.warmestMonth()?.temperature.mean ?? null);
  minTemp = computed(() => this.coldestMonth()?.temperature.mean ?? null);

  /** Ausgeschriebener Name des Monats (Zusatzzeile der Karten). */
  warmestMonthName = computed(() => this.monthNameOf(this.warmestMonth()));
  coldestMonthName = computed(() => this.monthNameOf(this.coldestMonth()));

  private extremeMonth(better: (a: number, b: number) => boolean): MonthSummary | null {
    let best: MonthSummary | null = null;
    for (const m of this.yearData()?.months ?? []) {
      const mean = m.temperature.mean;
      if (mean === null) continue;
      if (best === null || better(mean, best.temperature.mean!)) best = m;
    }
    return best;
  }

  private monthNameOf(month: MonthSummary | null): string | null {
    return month ? MONTH_LONG[month.month - 1] : null;
  }

  constructor() {
    effect(() => setPageTitle(this.title, yearViewTitle(this.selectedYear())));

    // Jahresauswahl: ein Request je Seitenaufruf, nicht je Jahreswechsel. Bei Fehler bleibt der Übergang (yearOptions).
    this.weather.getYearList().pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(),
    ).subscribe(list => this.yearList.set(list));

    // distinctUntilChanged: genau 1 Request-Satz je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht die Requests für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) => a.year === b.year && a.reload === b.reload),
      switchMap(({ year }) => this.loadYear(year)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** Auswahlfeld navigiert über den Router (V08). */
  onYearChange(event: Event): void {
    this.router.navigate(['/jahr', (event.target as HTMLSelectElement).value]);
  }

  /** Zwei parallele Requests: Jahreszusammenfassung und Monate des Jahres (US05). */
  private loadYear(year: string): Observable<YearResult> {
    // Ungültige Parameter lösen keinen Request aus
    if (!isValidYearParam(year, this.today)) {
      return of<YearResult>({ state: 'idle', data: null, message: null, retryable: true });
    }
    return forkJoin({
      summary: this.weather.getYearSummary(year),
      months: this.weather.getMonthSummaries(year),
    }).pipe(
      map(({ summary, months }): YearResult => ({ state: 'success', data: { summary, months: months.items }, message: null, retryable: true })),
      catchError(err => of<YearResult>(this.failure(err))),
      startWith<YearResult>({ state: 'loading', data: null, message: null, retryable: true }),
    );
  }

  /** 404 `NO_DATA` → Leerzustand; 400 → Meldung der API ohne „Erneut versuchen“; sonst Fehler mit Retry. */
  private failure(err: { status?: number } | null): YearResult {
    if (err?.status === 404) return { state: 'empty', data: null, message: YEAR_EMPTY_MESSAGE, retryable: true };
    if (err?.status === 400) return { state: 'error', data: null, message: apiErrorOf(err).message, retryable: false };
    return { state: 'error', data: null, message: YEAR_ERROR_MESSAGE, retryable: true };
  }

  private applyResult(result: YearResult): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.retryable.set(result.retryable);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F12)
    if (result.state !== 'loading') this.yearData.set(result.data);
  }
}
