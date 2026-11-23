import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, forkJoin, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { DayListItem, MonthSummary, YearList } from '../../models/api';
import { LoadResult, LoadState } from '../../models/load-state';
import { apiErrorOf } from '../../interceptors/api-error.interceptor';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { DataStatusService } from '../../services/data-status.service';
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
import { monthLabel, monthViewTitle, setPageTitle } from '../../utils/page-title';
import { isValidMonthParam, isValidYearParam } from '../../utils/route-params';
import { yearOptions } from '../../utils/year-options';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTH_EMPTY_MESSAGE = 'Keine gespeicherten Daten für diesen Monat.';
export const MONTH_ERROR_MESSAGE = 'Fehler beim Laden der Monatsdaten.';

/** Daten eines Monats: Zusammenfassung (Kennzahlen) und Tagesliste (Diagramm), beide aus der API (S8). */
export interface MonthData {
  summary: MonthSummary;
  days: DayListItem[];
}

interface MonthResult extends LoadResult<MonthData> {
  /** „Erneut versuchen“ anbieten; nicht bei 400 (dieselbe Anfrage scheitert wieder). */
  retryable: boolean;
}

/** Heute laut Server steht noch aus: Ladezustand ohne Request. */
const WAITING: MonthResult = { state: 'loading', data: null, message: null, retryable: true };

/** Anzahl der Tage eines Monats (Kalenderrechnung in UTC). */
function daysIn(year: string, month: string): number {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

@Component({
  selector: 'app-monthly-page',
  standalone: true,
  imports: [
    ClimateChartComponent, RouterLink, CardComponent, KpiCardComponent, ChipComponent, NoticeComponent, FormFieldComponent,
    SkeletonComponent, LoadingComponent, EmptyComponent, ErrorComponent,
  ],
  templateUrl: './monthly-page.html',
})
export class MonthlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);
  private dataStatus = inject(DataStatusService);
  /** Heute laut Server (`/api/status.today`), bis zur Antwort die Browser-Uhr (03 B4.8). */
  private today = this.dataStatus.today;
  readonly dataStartYear = DATA_START.slice(0, 4);

  /** Route-Parameter aus `/monat/:year/:month` (V08); auf `/monat` nicht gesetzt. */
  readonly year = input<string | undefined>();
  readonly month = input<string | undefined>();

  /** Auswahl, nur aus der URL abgeleitet; ohne Parameter der aktuelle Berliner Monat. */
  selectedYear = computed(() => this.year() ?? this.today().slice(0, 4));
  selectedMonth = computed(() => this.month() ?? this.today().slice(5, 7));
  /** Ungültiger Teil zeigt in seinem Select den Platzhalter „–“, der gültige Teil bleibt gewählt. */
  yearValid = computed(() => isValidYearParam(this.selectedYear(), this.today()));
  monthValid = computed(() => isValidMonthParam(this.selectedMonth()));
  invalid = computed(() => !this.yearValid() || !this.monthValid());

  monthData = signal<MonthData | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);
  retryable = signal(true);

  /** „Erneut versuchen“ erhöht den Zähler und lädt dieselbe Auswahl neu (B5.2). */
  private reloadCount = signal(0);
  /**
   * Request-Satz: Auswahl, Zähler und Heute laut Server (`to = min(Monatsende, heute)`). Solange `/api/status`
   * noch lädt (`wait`), geht kein Request hinaus, sonst stünde das Browser-Datum in `to` (400 `DATE_IN_FUTURE`).
   */
  private request = computed(() => ({
    year: this.selectedYear(), month: this.selectedMonth(), reload: this.reloadCount(),
    today: this.today(), wait: this.dataStatus.waiting(),
  }));

  /** Überschrift: „November 2026“; bei ungültiger Auswahl nur „Monat“. */
  headline = computed(() => this.invalid() ? 'Monat' : monthLabel(this.selectedYear(), this.selectedMonth()));

  /**
   * Zeitraum, zu dem `monthData` gehört. Während des Ladens eines anderen Monats bleiben die alten
   * Daten stehen, ihre Achse richtet sich nach diesem Zeitraum und nicht nach der neuen Auswahl.
   */
  dataPeriod = signal<{ year: string; month: string } | null>(null);
  daysInMonth = computed(() => {
    const period = this.dataPeriod();
    return period ? daysIn(period.year, period.month) : 0;
  });

  /** Jahre aus `GET /api/summaries/years` (F20), einmal je Seitenaufruf geladen; neuestes zuerst. */
  private yearList = signal<YearList | null>(null);
  years = computed(() => yearOptions(this.yearList(), this.yearValid() ? this.selectedYear() : null, this.today()));
  months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MONTH_NAMES[i]
  }));

  /** Kennzahlen aus der Zusammenfassung; das Frontend rechnet kein Mittel und keine Summe (S8). */
  summary = computed(() => this.monthData()?.summary ?? null);

  /** Volle Monatsachse 1. bis letzter Tag; Tage ohne Eintrag in `/api/days` sind `null` (Lücke, V21). */
  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.monthData();
    const days = this.daysInMonth();
    if (!data || days === 0) return null;
    const byDay = new Map(data.days.map(d => [Number(d.date.slice(8, 10)), d]));
    const axis = Array.from({ length: days }, (_, i) => i + 1);
    return {
      labels: axis.map(day => `${day}.`),
      temperatures: axis.map(day => byDay.get(day)?.temperature.mean ?? null),
      precipitations: axis.map(day => byDay.get(day)?.precipitationSum ?? null),
    };
  });

  constructor() {
    effect(() => setPageTitle(this.title, monthViewTitle(this.selectedYear(), this.selectedMonth())));

    // Jahresauswahl: ein Request je Seitenaufruf, nicht je Monatswechsel. Bei Fehler bleibt der Übergang (yearOptions).
    this.weather.getYearList().pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(),
    ).subscribe(list => this.yearList.set(list));

    // distinctUntilChanged: genau 1 Request-Satz je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht die Requests für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) =>
        a.year === b.year && a.month === b.month && a.reload === b.reload && a.today === b.today && a.wait === b.wait),
      switchMap(({ year, month, wait }) => (wait ? of(WAITING) : this.loadMonth(year, month))
        .pipe(map(result => ({ result, year, month })))),
      takeUntilDestroyed(),
    ).subscribe(({ result, year, month }) => this.applyResult(result, year, month));
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** Auswahlfelder navigieren über den Router (V08); ein ungültiger Rest fällt auf den aktuellen Monat zurück. */
  onYearChange(event: Event): void {
    const month = this.monthValid() ? this.selectedMonth() : this.today().slice(5, 7);
    this.router.navigate(['/monat', (event.target as HTMLSelectElement).value, month]);
  }

  onMonthChange(event: Event): void {
    const year = this.yearValid() ? this.selectedYear() : this.today().slice(0, 4);
    this.router.navigate(['/monat', year, (event.target as HTMLSelectElement).value]);
  }

  /**
   * Zwei parallele Requests (US04-10): Zusammenfassung und Tagesliste. Im laufenden Monat endet die
   * Tagesliste heute (`to = min(Monatsende, heute)`, US04-9), sonst gäbe die API 400 `DATE_IN_FUTURE`.
   */
  private loadMonth(year: string, month: string): Observable<MonthResult> {
    // Ungültige Parameter lösen keinen Request aus
    if (!isValidYearParam(year, this.today()) || !isValidMonthParam(month)) {
      return of<MonthResult>({ state: 'idle', data: null, message: null, retryable: true });
    }
    const yearMonth = `${year}-${month}`;
    // Monat nach dem laufenden (nur per URL erreichbar): kein Request, Leerzustand
    if (yearMonth > this.today().slice(0, 7)) {
      return of<MonthResult>({
        state: 'empty', data: null, message: `Für ${monthLabel(year, month)} liegen noch keine Daten vor.`, retryable: true,
      });
    }
    const monthEnd = `${yearMonth}-${String(daysIn(year, month)).padStart(2, '0')}`;
    const to = monthEnd < this.today() ? monthEnd : this.today();
    return forkJoin({
      summary: this.weather.getMonthSummary(yearMonth),
      days: this.weather.getDays(`${yearMonth}-01`, to),
    }).pipe(
      map(({ summary, days }): MonthResult => ({ state: 'success', data: { summary, days: days.items }, message: null, retryable: true })),
      catchError(err => of<MonthResult>(this.failure(err))),
      startWith<MonthResult>({ state: 'loading', data: null, message: null, retryable: true }),
    );
  }

  /** 404 `NO_DATA` → Leerzustand; 400 → Meldung der API ohne „Erneut versuchen“; sonst Fehler mit Retry. */
  private failure(err: { status?: number } | null): MonthResult {
    if (err?.status === 404) return { state: 'empty', data: null, message: MONTH_EMPTY_MESSAGE, retryable: true };
    if (err?.status === 400) return { state: 'error', data: null, message: apiErrorOf(err).message, retryable: false };
    return { state: 'error', data: null, message: MONTH_ERROR_MESSAGE, retryable: true };
  }

  private applyResult(result: MonthResult, year: string, month: string): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.retryable.set(result.retryable);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F12)
    if (result.state !== 'loading') {
      this.monthData.set(result.data);
      this.dataPeriod.set(result.data ? { year, month } : null);
    }
  }
}
