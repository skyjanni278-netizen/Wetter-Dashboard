import { Component, signal, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, forkJoin, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { MonthSummary, SummaryBase, YearList, YearSummary } from '../../models/api';
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
import { MONTH_LONG, setPageTitle, yearViewTitle } from '../../utils/page-title';
import { isValidYearParam } from '../../utils/route-params';
import { yearOptions } from '../../utils/year-options';
import {
  COMPARE_LOADING, COMPARE_OFF, COMPARE_QUERY_VALUE, ComparePlan, CompareResult, compareFailure, compareHintText,
  isPreviousYearMissing, precipitationDiffText, roundedDiff, temperatureDiffText, yearComparePlan,
} from '../../utils/compare-period';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const YEAR_EMPTY_MESSAGE = 'Keine gespeicherten Daten für dieses Jahr.';
export const YEAR_ERROR_MESSAGE = 'Fehler beim Laden der Jahresdaten.';
/** Nachkommastellen der Karte „Jahresniederschlag“; die Differenz rundet genauso (R29). */
const YEAR_PRECIP_DIGITS = 0;

/** Daten eines Jahres: Jahreszusammenfassung (Kennzahlen) und Monatszusammenfassungen (Diagramm), S8. */
export interface YearData {
  summary: YearSummary;
  months: MonthSummary[];
}

/**
 * Vorjahresvergleich (N06, R29): Werte beider Seiten und Monatsmittel des Vorjahres für die gestrichelte Linie.
 * `current = null`: vollständiges Jahr, dann gilt die Jahreszusammenfassung der Seite.
 */
export interface YearCompare {
  /** Verglichener Zeitraum im Differenztext: „2025“ bzw. „01.01.–18.11.2025“. */
  label: string;
  /** Name der Vorjahreslinie im Diagramm: „2025“ (ganzes Jahr). */
  lineLabel: string;
  current: SummaryBase | null;
  previous: SummaryBase;
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
    SkeletonComponent, LoadingComponent, EmptyComponent, ErrorComponent, IndicatorCardsComponent, ToggleChipComponent,
  ],
  templateUrl: './yearly-page.html',
})
export class YearlyPageComponent {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dataStatus = inject(DataStatusService);
  /** Heute laut Server (`/api/status.today`), bis zur Antwort die Browser-Uhr (03 B4.8). */
  private today = this.dataStatus.today;
  private currentYear = computed(() => this.today().slice(0, 4));
  readonly dataStartYear = DATA_START.slice(0, 4);

  /** Route-Parameter aus `/jahr/:year` (V08); auf `/jahr` nicht gesetzt. */
  readonly year = input<string | undefined>();
  /** Query `?vergleich=vorjahr` (N06, US19-7): Vorjahresvergleich an, bleibt nach F5 erhalten. */
  readonly vergleich = input<string | undefined>();

  /** Auswahl, nur aus der URL abgeleitet; ohne Parameter das aktuelle Berliner Jahr. */
  selectedYear = computed(() => this.year() ?? this.currentYear());
  invalid = computed(() => !isValidYearParam(this.selectedYear(), this.today()));
  yearData = signal<YearData | null>(null);
  /** Jahr, zu dem `yearData` gehört (beim Laden eines anderen Jahres bleiben die alten Daten stehen). */
  private dataYear = signal<string | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);
  retryable = signal(true);

  /** „Erneut versuchen“ erhöht den Zähler und lädt dasselbe Jahr neu (B5.2). */
  private reloadCount = signal(0);
  private request = computed(() => ({ year: this.selectedYear(), reload: this.reloadCount() }));

  /** Jahre aus `GET /api/summaries/years` (F20), einmal je Seitenaufruf geladen; neuestes zuerst. */
  private yearList = signal<YearList | null>(null);
  /** Die Jahresliste hat geantwortet (Erfolg oder Fehler); erst dann ist klar, ob es das Vorjahr gibt. */
  private yearListLoaded = signal(false);
  years = computed(() => yearOptions(this.yearList(), this.invalid() ? null : this.selectedYear(), this.today()));

  /** Kennzahlen aus der Jahreszusammenfassung: Ø nach R12 aus der API, nicht Mittel der Monatsmittel (F28). */
  summary = computed(() => this.yearData()?.summary ?? null);

  // ---------- Vorjahresvergleich (N06, R29, US19-7/-8) ----------

  /** Der Vergleich ist in der URL angefordert (`?vergleich=vorjahr`). */
  compareRequested = computed(() => this.vergleich() === COMPARE_QUERY_VALUE);
  /** Was verglichen wird; hängt von heute laut Server ab (laufendes Jahr: bis gestern). */
  comparePlan = computed<ComparePlan | null>(() => this.invalid() ? null : yearComparePlan(this.selectedYear(), this.today()));
  /** Vorjahr fehlt in `/api/summaries/years` (US19-8: `/jahr/2025`): Chip deaktiviert, ohne Request. */
  private previousYearMissing = computed(() => isPreviousYearMissing(this.comparePlan(), this.yearList()?.items ?? null));
  compareResult = signal<CompareResult<YearCompare>>(COMPARE_OFF);
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
   * Request-Satz des Vergleichs. Er startet erst, wenn die Daten des gewählten Jahres da sind, die Jahresliste
   * geantwortet hat und heute laut Server feststeht. `key` hängt nicht vom Ergebnis ab (sonst Schleife nach 404).
   */
  private compareRequest = computed(() => {
    const plan = this.comparePlan();
    const ready = this.dataYear() === this.selectedYear();
    const on = this.compareRequested() && !!plan && plan.kind !== 'none' && !this.previousYearMissing()
      && this.yearListLoaded() && !this.dataStatus.waiting() && ready;
    return { on, plan, key: on ? JSON.stringify(plan) : 'off' };
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
      precipitation: precipitationDiffText(
        roundedDiff(current.precipitationSum, previous.precipitationSum, YEAR_PRECIP_DIGITS), label, YEAR_PRECIP_DIGITS),
    };
  });
  readonly precipDigits = YEAR_PRECIP_DIGITS;

  /**
   * Volle Jahresachse Jan–Dez; Monate ohne Zusammenfassung sind `null` und zeigen eine Lücke (V21).
   * Mit Vergleich die Monatsmittel des Vorjahres als zweite Linie (N06).
   */
  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.yearData();
    if (!data) return null;
    const byMonth = new Map(data.months.map(m => [m.month, m]));
    const axis = Array.from({ length: 12 }, (_, i) => i + 1);
    const dataset: ClimateChartDataset = {
      labels: axis.map(month => MONTH_NAMES[month - 1]),
      temperatures: axis.map(month => byMonth.get(month)?.temperature.mean ?? null),
      precipitations: axis.map(month => byMonth.get(month)?.precipitationSum ?? null),
    };
    const compare = this.compareResult();
    if (this.comparing() && compare.state === 'success' && compare.data) {
      const previous = new Map(compare.data.months.map(m => [m.month, m]));
      dataset.compare = {
        label: compare.data.lineLabel,
        temperatures: axis.map(month => previous.get(month)?.temperature.mean ?? null),
      };
    }
    return dataset;
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
    ).subscribe(list => {
      this.yearList.set(list);
      this.yearListLoaded.set(true);
    });

    // distinctUntilChanged: genau 1 Request-Satz je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht die Requests für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) => a.year === b.year && a.reload === b.reload),
      switchMap(({ year }) => this.loadYear(year).pipe(map(result => ({ result, year })))),
      takeUntilDestroyed(),
    ).subscribe(({ result, year }) => this.applyResult(result, year));

    // Vorjahresvergleich: höchstens ein Request-Satz je Jahr und Plan; switchMap bricht einen überholten ab.
    toObservable(this.compareRequest).pipe(
      distinctUntilChanged((a, b) => a.key === b.key),
      switchMap(({ on, plan }) => (on && plan ? this.loadCompare(plan) : of(COMPARE_OFF))),
      takeUntilDestroyed(),
    ).subscribe(result => this.compareResult.set(result));
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** Schalter-Chip: Zustand nur in der URL (`?vergleich=vorjahr`, V08), damit F5 ihn behält (US19-7). */
  setCompare(on: boolean): void {
    this.router.navigate([], {
      relativeTo: this.route, queryParams: { vergleich: on ? COMPARE_QUERY_VALUE : null }, queryParamsHandling: 'merge',
    });
  }

  /** Auswahlfeld navigiert über den Router (V08); die Query (`?vergleich=vorjahr`) bleibt erhalten. */
  onYearChange(event: Event): void {
    this.router.navigate(['/jahr', (event.target as HTMLSelectElement).value], { queryParamsHandling: 'preserve' });
  }

  /** Zwei parallele Requests: Jahreszusammenfassung und Monate des Jahres (US05). */
  private loadYear(year: string): Observable<YearResult> {
    // Ungültige Parameter lösen keinen Request aus
    if (!isValidYearParam(year, this.today())) {
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

  /**
   * Vorjahr (R29): vollständiges Jahr → `/summaries/years/{Vorjahr}`; laufendes Jahr → genau zwei Requests auf
   * `/summaries/periods` (beide vom 01.01. bis gestern, US19-7). Dazu die Monate des Vorjahres für die Linie.
   * 404 → `unavailable` (Chip deaktiviert), anderer Fehler → `error` (nur Hinweis, kein Seitenfehler).
   */
  private loadCompare(plan: ComparePlan): Observable<CompareResult<YearCompare>> {
    if (plan.kind === 'none') return of(COMPARE_OFF);
    const summaries: Observable<{ current: SummaryBase | null; previous: SummaryBase }> = plan.kind === 'calendar'
      ? this.weather.getYearSummary(plan.previousId).pipe(map(previous => ({ current: null, previous })))
      : forkJoin({
        current: this.weather.getPeriod(plan.current.from, plan.current.to),
        previous: this.weather.getPeriod(plan.previous.from, plan.previous.to),
      });
    return forkJoin({ summaries, months: this.weather.getMonthSummaries(plan.previousYear) }).pipe(
      map(({ summaries: { current, previous }, months }): CompareResult<YearCompare> => ({
        state: 'success',
        data: { label: plan.label, lineLabel: plan.previousYear, current, previous, months: months.items },
      })),
      catchError(err => of(compareFailure(err))),
      startWith(COMPARE_LOADING),
    );
  }

  /** 404 `NO_DATA` → Leerzustand; 400 → Meldung der API ohne „Erneut versuchen“; sonst Fehler mit Retry. */
  private failure(err: { status?: number } | null): YearResult {
    if (err?.status === 404) return { state: 'empty', data: null, message: YEAR_EMPTY_MESSAGE, retryable: true };
    if (err?.status === 400) return { state: 'error', data: null, message: apiErrorOf(err).message, retryable: false };
    return { state: 'error', data: null, message: YEAR_ERROR_MESSAGE, retryable: true };
  }

  private applyResult(result: YearResult, year: string): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.retryable.set(result.retryable);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F12)
    if (result.state !== 'loading') {
      this.yearData.set(result.data);
      this.dataYear.set(result.data ? year : null);
    }
  }
}
