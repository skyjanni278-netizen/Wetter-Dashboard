import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, forkJoin, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { DayListItem, MonthSummary, SummaryBase, YearList } from '../../models/api';
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
import { IndicatorCardsComponent } from '../../components/indicator-cards/indicator-cards';
import { ToggleChipComponent } from '../../components/toggle-chip/toggle-chip';
import { monthLabel, monthViewTitle, setPageTitle } from '../../utils/page-title';
import { isValidMonthParam, isValidYearParam } from '../../utils/route-params';
import { yearOptions } from '../../utils/year-options';
import {
  COMPARE_LOADING, COMPARE_OFF, COMPARE_QUERY_VALUE, ComparePlan, CompareResult, compareFailure, compareHintText,
  isPreviousYearMissing, monthComparePlan, precipitationDiffText, roundedDiff, temperatureDiffText,
} from '../../utils/compare-period';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTH_EMPTY_MESSAGE = 'Keine gespeicherten Daten für diesen Monat.';
export const MONTH_ERROR_MESSAGE = 'Fehler beim Laden der Monatsdaten.';

/** Daten eines Monats: Zusammenfassung (Kennzahlen) und Tagesliste (Diagramm), beide aus der API (S8). */
export interface MonthData {
  summary: MonthSummary;
  days: DayListItem[];
}

/**
 * Vorjahresvergleich (N06, R29): Werte beider Seiten und Tageswerte des Vorjahresmonats für die gestrichelte Linie.
 * `current = null`: vollständiger Monat, dann gilt die Zusammenfassung der Seite.
 */
export interface MonthCompare {
  /** Verglichener Zeitraum im Differenztext: „November 2025“ bzw. „01.–18.11.2025“. */
  label: string;
  /** Name der Vorjahreslinie im Diagramm: „November 2025“ (ganzer Monat). */
  lineLabel: string;
  current: SummaryBase | null;
  previous: SummaryBase;
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
    SkeletonComponent, LoadingComponent, EmptyComponent, ErrorComponent, IndicatorCardsComponent, ToggleChipComponent,
  ],
  templateUrl: './monthly-page.html',
})
export class MonthlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dataStatus = inject(DataStatusService);
  /** Heute laut Server (`/api/status.today`), bis zur Antwort die Browser-Uhr (03 B4.8). */
  private today = this.dataStatus.today;
  readonly dataStartYear = DATA_START.slice(0, 4);

  /** Route-Parameter aus `/monat/:year/:month` (V08); auf `/monat` nicht gesetzt. */
  readonly year = input<string | undefined>();
  readonly month = input<string | undefined>();
  /** Query `?vergleich=vorjahr` (N06, US19-9): Vorjahresvergleich an, bleibt nach F5 erhalten. */
  readonly vergleich = input<string | undefined>();

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
  /** Die Jahresliste hat geantwortet (Erfolg oder Fehler); erst dann ist klar, ob es das Vorjahr gibt. */
  private yearListLoaded = signal(false);
  years = computed(() => yearOptions(this.yearList(), this.yearValid() ? this.selectedYear() : null, this.today()));
  months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MONTH_NAMES[i]
  }));

  /** Kennzahlen aus der Zusammenfassung; das Frontend rechnet kein Mittel und keine Summe (S8). */
  summary = computed(() => this.monthData()?.summary ?? null);

  // ---------- Vorjahresvergleich (N06, R29, US19-9) ----------

  /** Der Vergleich ist in der URL angefordert (`?vergleich=vorjahr`). */
  compareRequested = computed(() => this.vergleich() === COMPARE_QUERY_VALUE);
  /** Was verglichen wird; hängt von heute laut Server ab (laufender Monat: bis gestern). */
  comparePlan = computed<ComparePlan | null>(() =>
    this.invalid() ? null : monthComparePlan(this.selectedYear(), this.selectedMonth(), this.today()));
  /** Vorjahr fehlt in `/api/summaries/years`: Chip deaktiviert, ohne Request. */
  private previousYearMissing = computed(() => isPreviousYearMissing(this.comparePlan(), this.yearList()?.items ?? null));
  compareResult = signal<CompareResult<MonthCompare>>(COMPARE_OFF);
  /** Chip deaktiviert: kein vollständiger Tag, Vorjahr nicht in der Jahresliste oder 404 (R29, kein Fehlerzustand). */
  compareUnavailable = computed(() => {
    const plan = this.comparePlan();
    return !plan || plan.kind === 'none' || this.previousYearMissing() || this.compareResult().state === 'unavailable';
  });
  /** Chip gedrückt (`aria-pressed`). */
  comparing = computed(() => this.compareRequested() && !this.compareUnavailable());
  compareHint = computed(() =>
    compareHintText(this.comparePlan(), this.previousYearMissing(), this.compareRequested(), this.compareResult()));

  /**
   * Request-Satz des Vergleichs. Er startet erst, wenn die Daten des gewählten Monats da sind, die Jahresliste
   * geantwortet hat und heute laut Server feststeht. `key` hängt nicht vom Ergebnis ab (sonst Schleife nach 404).
   */
  private compareRequest = computed(() => {
    const plan = this.comparePlan();
    const period = this.dataPeriod();
    const ready = !!period && period.year === this.selectedYear() && period.month === this.selectedMonth();
    const on = this.compareRequested() && !!plan && plan.kind !== 'none' && !this.previousYearMissing()
      && this.yearListLoaded() && !this.dataStatus.waiting() && ready;
    return { on, plan, month: this.selectedMonth(), key: on ? `${this.selectedMonth()}|${JSON.stringify(plan)}` : 'off' };
  });

  /** Differenztexte der Kennzahlen: gerundet − gerundet (R29), Nachkommastellen wie die Karte. */
  compareTexts = computed(() => {
    const result = this.compareResult();
    const summary = this.summary();
    if (!this.comparing() || result.state !== 'success' || !result.data || !summary) return null;
    const { label, previous } = result.data;
    const current = result.data.current ?? summary;
    return {
      temperature: temperatureDiffText(roundedDiff(current.temperature.mean, previous.temperature.mean, 1), label),
      precipitation: precipitationDiffText(roundedDiff(current.precipitationSum, previous.precipitationSum, 1), label, 1),
    };
  });

  /**
   * Volle Monatsachse 1. bis letzter Tag; Tage ohne Eintrag in `/api/days` sind `null` (Lücke, V21).
   * Mit Vergleich die Tagesmittel des Vorjahresmonats als zweite Linie (N06).
   */
  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.monthData();
    const days = this.daysInMonth();
    if (!data || days === 0) return null;
    const byDay = new Map(data.days.map(d => [Number(d.date.slice(8, 10)), d]));
    const axis = Array.from({ length: days }, (_, i) => i + 1);
    const dataset: ClimateChartDataset = {
      labels: axis.map(day => `${day}.`),
      temperatures: axis.map(day => byDay.get(day)?.temperature.mean ?? null),
      precipitations: axis.map(day => byDay.get(day)?.precipitationSum ?? null),
    };
    // Tage, die es im Vorjahresmonat nicht gibt (29.02.), bleiben eine Lücke
    const compare = this.compareResult();
    if (this.comparing() && compare.state === 'success' && compare.data) {
      const previous = new Map(compare.data.days.map(d => [Number(d.date.slice(8, 10)), d]));
      dataset.compare = {
        label: compare.data.lineLabel,
        temperatures: axis.map(day => previous.get(day)?.temperature.mean ?? null),
      };
    }
    return dataset;
  });

  constructor() {
    effect(() => setPageTitle(this.title, monthViewTitle(this.selectedYear(), this.selectedMonth())));

    // Jahresauswahl: ein Request je Seitenaufruf, nicht je Monatswechsel. Bei Fehler bleibt der Übergang (yearOptions).
    this.weather.getYearList().pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(),
    ).subscribe(list => {
      this.yearList.set(list);
      this.yearListLoaded.set(true);
    });

    // distinctUntilChanged: genau 1 Request-Satz je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht die Requests für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) =>
        a.year === b.year && a.month === b.month && a.reload === b.reload && a.today === b.today && a.wait === b.wait),
      switchMap(({ year, month, wait }) => (wait ? of(WAITING) : this.loadMonth(year, month))
        .pipe(map(result => ({ result, year, month })))),
      takeUntilDestroyed(),
    ).subscribe(({ result, year, month }) => this.applyResult(result, year, month));

    // Vorjahresvergleich: höchstens ein Request-Satz je Monat und Plan; switchMap bricht einen überholten ab.
    toObservable(this.compareRequest).pipe(
      distinctUntilChanged((a, b) => a.key === b.key),
      switchMap(({ on, plan, month }) => (on && plan ? this.loadCompare(plan, month) : of(COMPARE_OFF))),
      takeUntilDestroyed(),
    ).subscribe(result => this.compareResult.set(result));
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** Schalter-Chip: Zustand nur in der URL (`?vergleich=vorjahr`, V08), damit F5 ihn behält (US19-8). */
  setCompare(on: boolean): void {
    this.router.navigate([], {
      relativeTo: this.route, queryParams: { vergleich: on ? COMPARE_QUERY_VALUE : null }, queryParamsHandling: 'merge',
    });
  }

  /**
   * Auswahlfelder navigieren über den Router (V08); ein ungültiger Rest fällt auf den aktuellen Monat zurück.
   * Die Query (`?vergleich=vorjahr`) bleibt beim Wechsel erhalten.
   */
  onYearChange(event: Event): void {
    const month = this.monthValid() ? this.selectedMonth() : this.today().slice(5, 7);
    this.router.navigate(['/monat', (event.target as HTMLSelectElement).value, month], { queryParamsHandling: 'preserve' });
  }

  onMonthChange(event: Event): void {
    const year = this.yearValid() ? this.selectedYear() : this.today().slice(0, 4);
    this.router.navigate(['/monat', year, (event.target as HTMLSelectElement).value], { queryParamsHandling: 'preserve' });
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

  /**
   * Vorjahr (R29): vollständiger Monat → `/summaries/months/{Vorjahresmonat}`; laufender Monat → genau zwei
   * Requests auf `/summaries/periods` (beide vom 1. bis gestern). Dazu die Tage des ganzen Vorjahresmonats für
   * die Linie. 404 → `unavailable` (Chip deaktiviert), anderer Fehler → `error` (nur Hinweis, kein Seitenfehler).
   */
  private loadCompare(plan: ComparePlan, month: string): Observable<CompareResult<MonthCompare>> {
    if (plan.kind === 'none') return of(COMPARE_OFF);
    const previousYear = plan.previousYear;
    const lineEnd = `${previousYear}-${month}-${String(daysIn(previousYear, month)).padStart(2, '0')}`;
    const summaries: Observable<{ current: SummaryBase | null; previous: SummaryBase }> = plan.kind === 'calendar'
      ? this.weather.getMonthSummary(plan.previousId).pipe(map(previous => ({ current: null, previous })))
      : forkJoin({
        current: this.weather.getPeriod(plan.current.from, plan.current.to),
        previous: this.weather.getPeriod(plan.previous.from, plan.previous.to),
      });
    return forkJoin({ summaries, days: this.weather.getDays(`${previousYear}-${month}-01`, lineEnd) }).pipe(
      map(({ summaries: { current, previous }, days }): CompareResult<MonthCompare> => ({
        state: 'success',
        data: { label: plan.label, lineLabel: monthLabel(previousYear, month), current, previous, days: days.items },
      })),
      catchError(err => of(compareFailure(err))),
      startWith(COMPARE_LOADING),
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
