import { Component, DestroyRef, ElementRef, OnInit, signal, computed, effect, inject, input, linkedSignal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { ApiError, Day, DayHour, Forecast } from '../../models/api';
import { LoadResult, LoadState } from '../../models/load-state';
import { UNREACHABLE_MESSAGE, apiErrorOf } from '../../interceptors/api-error.interceptor';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { CardComponent } from '../../components/card/card';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card';
import { ChipComponent } from '../../components/chip/chip';
import { NoticeComponent } from '../../components/notice/notice';
import { FormFieldComponent } from '../../components/form-field/form-field';
import { DataTableColumn, DataTableComponent, DataTableRow } from '../../components/data-table/data-table';
import { SkeletonComponent } from '../../components/skeleton/skeleton';
import { LoadingComponent } from '../../components/state/loading';
import { EmptyComponent } from '../../components/state/empty';
import { ErrorComponent } from '../../components/state/error';
import { getWeatherIcon, describeWeather, getWindDirection } from '../../utils/weather-icon';
import { berlinToday, addDays, formatDateDe, formatDateLongDe, isValidIsoDate } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { dayViewTitle, setPageTitle } from '../../utils/page-title';
import { dayParamStatus } from '../../utils/route-params';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Pause, nach der ein getipptes Datum ohne Enter oder Verlassen des Felds übernommen wird. */
export const KEYBOARD_COMMIT_DELAY_MS = 800;

/** Ladeergebnis eines Tages mit dem Fehler der API (für `app-error`) und dem Server-Fehler am Feld `date`. */
interface DayResult extends LoadResult<Day> {
  apiError: ApiError | null;
  fieldError: string | null;
}

/** „14:00“ aus `2026-11-19T14:00`. */
function hourOf(timeLocal: string): string {
  return timeLocal.slice(11, 16);
}

@Component({
  selector: 'app-today-page',
  standalone: true,
  imports: [
    UnitPipe, ClimateChartComponent, RouterLink, CardComponent, KpiCardComponent, ChipComponent, NoticeComponent,
    FormFieldComponent, DataTableComponent, SkeletonComponent, LoadingComponent, EmptyComponent, ErrorComponent,
  ],
  templateUrl: './today-page.html',
  styleUrl: './today-page.css'
})
export class TodayPageComponent implements OnInit {
  private weather = inject(WeatherService);
  private title = inject(Title);
  private router = inject(Router);

  readonly getWeatherIcon = getWeatherIcon;
  readonly describeWeather = describeWeather;
  readonly getWindDirection = getWindDirection;
  readonly formatDateDe = formatDateDe;
  private unitPipe = new UnitPipe();

  /** Spalten der 7-Tage-Vorschau (E3.7.5); „Niederschlag“ mit weichem Trennstrich für schmale Ansichten. */
  readonly forecastColumns: DataTableColumn[] = [
    { key: 'day', label: 'Tag', rowHeader: true },
    { key: 'weather', label: 'Wetter' },
    { key: 'max', label: 'Max', align: 'end' },
    { key: 'min', label: 'Min', align: 'end' },
    { key: 'rain', label: 'Nieder\u00ADschlag', align: 'end' },
  ];

  /** Schmale Variante unter 48em: Max/Min zusammen, vier Spalten. */
  readonly forecastColumnsNarrow: DataTableColumn[] = [
    { key: 'day', label: 'Tag', rowHeader: true },
    { key: 'weather', label: 'Wetter' },
    { key: 'maxmin', label: 'Max / Min', align: 'end' },
    { key: 'rain', label: 'Nieder\u00ADschlag', align: 'end' },
  ];

  /** Grenzen des Datumsfelds (V12, F19). */
  readonly minDate = DATA_START;
  readonly maxDate = berlinToday();

  /** Route-Parameter `:date` aus `/tag/:date` (V08); auf `/` nicht gesetzt. */
  readonly date = input<string | undefined>();

  /** Gewählter Tag, nur aus der URL abgeleitet; ohne Parameter heute (Berlin). */
  selectedDate = computed(() => this.date() ?? berlinToday());
  dateStatus = computed(() => dayParamStatus(this.selectedDate()));
  invalidDate = computed(() => this.dateStatus() === 'invalid');

  private dateInput = viewChild<ElementRef<HTMLInputElement>>('dateInput');

  /**
   * Noch nicht übernommene Eingabe im Datumsfeld (leer, unvollständig getippt oder außerhalb min…max).
   * null = Feld zeigt den Tag aus der URL. Wird bei jedem Navigationswechsel zurückgesetzt (F09).
   * Der Feldwert selbst bleibt stehen, damit Tastatureingaben nicht überschrieben werden.
   */
  fieldInput = linkedSignal<string, string | null>({ source: () => this.selectedDate(), computation: () => null });
  fieldError = computed(() => {
    const value = this.fieldInput();
    if (value === null) return null;
    if (value === '') return 'Bitte ein Datum wählen.';
    return this.isSelectable(value) ? null : this.rangeMessage;
  });
  private readonly rangeMessage =
    `Bitte ein Datum zwischen ${formatDateDe(DATA_START)} und ${formatDateDe(this.maxDate)} wählen.`;

  /** Getippter, gültiger Tag, der noch nicht übernommen wurde (siehe onDateChange). */
  private pendingDate: string | null = null;
  private commitTimer: ReturnType<typeof setTimeout> | undefined;
  private keyboardEdit = false;

  /**
   * Ausgangstag für ‹ und ›: der zuletzt angesteuerte Tag. Er ist schon gesetzt, bevor die Navigation
   * abgeschlossen ist (z. B. wenn das Verlassen des Felds eine Eingabe übernimmt und gleich ‹ folgt).
   */
  private navBase = linkedSignal(() => this.selectedDate());

  dayData = signal<Day | null>(null);
  forecast = signal<Forecast[]>([]);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);
  /** Fehler der API zum letzten Request (B3.3); `app-error` zeigt bei `NO_DATA` den Link zum Datenbeginn. */
  apiError = signal<ApiError | null>(null);
  /** „Erneut versuchen“ nur, wenn ein neuer Versuch etwas ändern kann (nicht bei 400 und `NO_DATA`). */
  retryable = computed(() => {
    const e = this.apiError();
    return !e || (e.statusCode !== 400 && e.code !== 'NO_DATA');
  });
  /**
   * Server-Fehler am Feld `date` (400 mit `errors[].field = "date"`, B5.2), z. B. `DATE_IN_FUTURE`,
   * wenn die Uhr des Servers einen anderen Tag hat. Entfällt beim nächsten Request oder einer Eingabe.
   * Sperrt ‹ › nicht, damit man vom Tag wegnavigieren kann.
   */
  serverFieldError = signal<string | null>(null);
  /** Angezeigte Meldung am Datumsfeld: Prüfung im Browser vor Server-Fehler. */
  shownFieldError = computed(() => this.fieldError() ?? this.serverFieldError());

  /** Erhöht sich bei „Heute“ (auf `/`) und „Erneut versuchen“, damit ohne Datumswechsel neu geladen wird. */
  private reloadCount = signal(0);
  private request = computed(() => ({ date: this.selectedDate(), reload: this.reloadCount() }));

  isToday  = computed(() => this.selectedDate() === berlinToday());
  isFuture = computed(() => this.dateStatus() === 'future');

  /** ‹ ist an DATA_START gesperrt, › an heute (F19); beide bei Feldfehler oder ungültigem Datum. */
  prevDisabled = computed(() => this.fieldError() !== null || this.invalidDate() || this.selectedDate() <= DATA_START);
  nextDisabled = computed(() => this.fieldError() !== null || this.invalidDate() || this.isToday() || this.isFuture());

  /** Vorschau für ein Zukunftsdatum, sofern es in den nächsten 7 Tagen liegt (V12). */
  futureForecast = computed(() =>
    this.isFuture() ? this.forecast().find(f => f.date === this.selectedDate()) ?? null : null);

  /**
   * Der geladene Tag läuft noch (Server: `isToday`): Werte „bis jetzt“, Hero „Jetzt“, Vorschau.
   * Der Server entscheidet, weil nur er weiß, welche Stunden schon vergangen sind (R08, F06).
   */
  liveDay = computed(() => this.dayData()?.isToday === true);

  /** Stunde für den Hero „Jetzt“ (US01-6): Eintrag in `hours[]` mit `timeLocal = current.timeLocal`. */
  currentHour = computed<DayHour | null>(() => {
    const data = this.dayData();
    const current = data?.current;
    if (!data || !current) return null;
    return data.hours.find(h => h.timeLocal === current.timeLocal) ?? null;
  });

  /** Mittagsstunde für Symbol und Wettertext an vergangenen Tagen. */
  noonHour = computed<DayHour | null>(() => {
    const hours = this.dayData()?.hours ?? [];
    return hours.find(h => h.timeLocal.endsWith('T12:00')) ?? hours[Math.floor(hours.length / 2)] ?? null;
  });

  /** Min, Max und Summe kommen fertig vom Server, nur aus vergangenen Stunden (F13, F15, S8). */
  observedMin = computed(() => this.dayData()?.observed.temperature.min ?? null);
  observedMax = computed(() => this.dayData()?.observed.temperature.max ?? null);
  observedPrecip = computed(() => this.dayData()?.observed.precipitationSum ?? null);

  /** Uhrzeit von Höchst- und Tiefstwert („um 13:00 Uhr“). */
  maxAtText = computed(() => this.atText(this.dayData()?.observed.temperature.maxAt ?? null));
  minAtText = computed(() => this.atText(this.dayData()?.observed.temperature.minAt ?? null));

  dayTempRange = computed(() => {
    const min = this.observedMin();
    const max = this.observedMax();
    if (min === null || max === null) return null;
    return Math.round((max - min) * 10) / 10;
  });

  /** Vorhersage für den Rest des Tages (F13): nur, wenn es Vorhersagestunden gibt. */
  predicted = computed(() => {
    const data = this.dayData();
    return data && data.hoursPredicted > 0 ? data.predicted : null;
  });

  /** Zusatz an „Niederschlag bis jetzt“: „+5,4 mm erwartet“. */
  expectedPrecipText = computed(() => {
    const sum = this.predicted()?.precipitationSum ?? null;
    return sum === null ? null : `+${this.unitPipe.transform(sum, 'mm', '1.1-1')} erwartet`;
  });

  /** Temperaturspanne der Vorhersagestunden („8,1 bis 9,4 °C“). */
  restOfDayText = computed(() => {
    const t = this.predicted()?.temperature;
    if (!t || t.min === null || t.max === null) return null;
    return `${this.unitPipe.transform(t.min, '°C', '1.1-1')} bis ${this.unitPipe.transform(t.max, '°C', '1.1-1')}`;
  });

  chartData = computed<ClimateChartDataset | null>(() => {
    const data = this.dayData();
    if (!data) return null;
    return {
      labels: data.hours.map(h => hourOf(h.timeLocal)),
      temperatures: data.hours.map(h => h.temperature),
      precipitations: data.hours.map(h => h.precipitation),
    };
  });

  /** Erste Vorhersagestunde im Diagramm aus `isPrediction` (R08); ohne Vorhersage `null`. */
  chartPredictionFrom = computed<number | null>(() => {
    const index = this.dayData()?.hours.findIndex(h => h.isPrediction) ?? -1;
    return index >= 0 ? index : null;
  });

  /** Zeilen der Vorschau-Tabelle: Wochentag, Wettersymbol mit Text, Max, Min, Niederschlag (F17). */
  forecastRows = computed<DataTableRow[]>(() =>
    this.forecast().map(f => {
      const [, month, day] = f.date.split('-');
      const label = `${DAY_NAMES[new Date(f.date + 'T12:00:00').getDay()]} ${day}.${month}.`;
      const max = this.unitPipe.transform(f.maxTemp, '°', '1.0-0');
      const min = this.unitPipe.transform(f.minTemp, '°', '1.0-0');
      return {
        day: f.date === berlinToday() ? 'Heute' : label,
        weather: { icon: getWeatherIcon(f.weatherCode), text: describeWeather(f.weatherCode) },
        max,
        min,
        maxmin: `${max} / ${min}`,
        rain: this.unitPipe.transform(f.precipitationSum, 'mm', '1.1-1'),
      };
    })
  );

  /** Überschrift: der gewählte Tag ausgeschrieben (V16, F24). */
  headline = computed(() => this.invalidDate() ? 'Tagesansicht' : formatDateLongDe(this.selectedDate()));

  /** Kicker über der Überschrift; bei ungültigem Datum keiner. */
  pageKicker = computed(() => {
    if (this.invalidDate()) return null;
    if (this.isFuture()) return 'Vorhersage';
    return this.isToday() ? 'Heute' : 'Rückblick';
  });

  constructor() {
    effect(() => setPageTitle(this.title, dayViewTitle(this.selectedDate())));

    // distinctUntilChanged: genau 1 Request je Wechsel, auch wenn Router und Signal gleichzeitig melden.
    // switchMap bricht den Request für eine überholte Auswahl ab (V03, F04).
    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) => a.date === b.date && a.reload === b.reload),
      switchMap(({ date }) => this.loadDay(date)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));

    inject(DestroyRef).onDestroy(() => this.cancelPending());
  }

  ngOnInit(): void {
    this.weather.getForecasts().subscribe({ next: f => this.forecast.set(f.items ?? []), error: () => {} });
  }

  /** Wind der Stunde: „21 km/h aus SW“; ohne Richtung nur die Geschwindigkeit. */
  windText(hour: DayHour): string {
    const speed = this.unitPipe.transform(hour.windSpeed, 'km/h', '1.0-0');
    return hour.windDirection === null ? speed : `${speed} aus ${getWindDirection(hour.windDirection)}`;
  }

  /** „14:00“ aus `timeLocal`. */
  hourOf(timeLocal: string): string {
    return hourOf(timeLocal);
  }

  private atText(timeLocal: string | null): string | null {
    return timeLocal ? `um ${hourOf(timeLocal)} Uhr` : null;
  }

  /**
   * Datumsfeld: navigiert nur bei einem gültigen Tag innerhalb min…max. Leere, halb getippte
   * (z. B. „0002-11-05“) oder zu frühe/späte Werte zeigen die Meldung am Feld, ohne Request
   * und ohne URL-Wechsel (F09).
   * Chromium meldet beim Tippen jeden vollständigen Zwischenwert als change (05.11. → 05.01. → 05.11.).
   * Tastatureingaben werden daher erst mit Enter, beim Verlassen des Felds oder nach einer Pause
   * übernommen; eine Auswahl im Kalender (ohne Taste) navigiert sofort.
   */
  onDateChange(event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = field.value;
    const byKeyboard = this.keyboardEdit;
    this.keyboardEdit = false;
    this.cancelPending();
    this.serverFieldError.set(null);
    if (!value || !field.validity.valid || !this.isSelectable(value)) {
      this.fieldInput.set(value);
      return;
    }
    this.fieldInput.set(null);
    if (value === this.selectedDate()) return;
    if (byKeyboard) {
      this.pendingDate = value;
      this.commitTimer = setTimeout(() => this.commitPending(), KEYBOARD_COMMIT_DELAY_MS);
      return;
    }
    this.navigateToDate(value);
  }

  /** Tasten im Datumsfeld: Enter übernimmt sofort, andere Tasten markieren die Eingabe als getippt. */
  onDateKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.commitPending();
      return;
    }
    if (event.key !== 'Tab' && event.key !== 'Shift') this.keyboardEdit = true;
  }

  /** Verlassen des Felds übernimmt eine getippte Eingabe sofort. */
  onDateBlur(): void {
    this.commitPending();
  }

  private commitPending(): void {
    const date = this.pendingDate;
    this.cancelPending();
    if (date) this.navigateToDate(date);
  }

  private cancelPending(): void {
    clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    this.pendingDate = null;
  }

  /** „Heute“: auf `/` neu laden (und das Feld zurücksetzen), sonst nach `/` navigieren. */
  loadToday(): void {
    if (this.date() === undefined) {
      this.resetField();
      this.reloadCount.update(n => n + 1);
      return;
    }
    this.router.navigate(['/']);
  }

  /** Tag im Bereich des Datumsfelds (DATA_START bis heute). */
  private isSelectable(value: string): boolean {
    return isValidIsoDate(value) && value >= DATA_START && value <= this.maxDate;
  }

  /** Setzt eine nicht übernommene Eingabe zurück; die Bindung allein ändert den DOM-Wert dabei nicht. */
  private resetField(): void {
    this.fieldInput.set(null);
    const el = this.dateInput()?.nativeElement;
    if (el) el.value = this.selectedDate();
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  loadPreviousDay(): void {
    if (this.prevDisabled() || this.navBase() <= DATA_START) return;
    this.navigateToDate(addDays(this.navBase(), -1));
  }

  loadNextDay(): void {
    if (this.nextDisabled()) return;
    const date = addDays(this.navBase(), 1);
    if (date > berlinToday()) return;
    this.navigateToDate(date);
  }

  /** Zustandswechsel nur über den Router, damit History-Einträge entstehen (V08). Heute ist `/`. */
  private navigateToDate(date: string): void {
    this.navBase.set(date);
    this.router.navigate(date === berlinToday() ? ['/'] : ['/tag', date]);
  }

  private loadDay(date: string): Observable<DayResult> {
    const today = berlinToday();
    const status = dayParamStatus(date, today);
    // Ungültige Daten und Zukunftsdaten lösen keinen Request aus
    if (status === 'invalid' || status === 'future') {
      return of<DayResult>({ state: 'idle', data: null, message: null, apiError: null, fieldError: null });
    }
    const obs = date === today
      ? this.weather.getToday()
      : this.weather.getDay(date);
    return obs.pipe(
      map((data): DayResult => data?.hours?.length
        ? { state: 'success', data, message: null, apiError: null, fieldError: null }
        : { state: 'empty', data: null, message: 'Keine Daten für diesen Tag gefunden.', apiError: null, fieldError: null }),
      catchError(err => of(this.errorResult(err, date))),
      startWith<DayResult>({ state: 'loading', data: null, message: null, apiError: null, fieldError: null }),
    );
  }

  /**
   * Meldung je nach Ursache (V20), aus dem Fehler der API (B3.3):
   * - 404 `NO_DATA`: „Für den … liegen keine Daten vor. Daten gibt es ab dem …“ (Datenbeginn aus
   *   `details.dataFrom`), Fehlerbox mit Link zum Datenbeginn, ohne „Erneut versuchen“;
   * - 400 (z. B. `DATE_IN_FUTURE`, `VALIDATION_FAILED`): Meldung der API, Feldfehler `date` am Datumsfeld;
   * - Netzwerk und 5xx: „Server nicht erreichbar.“ (wie bisher), mit „Erneut versuchen“.
   */
  private errorResult(err: unknown, date: string): DayResult {
    const apiError = apiErrorOf(err);
    if (apiError.code === 'NO_DATA' || apiError.statusCode === 404) {
      const from = apiError.details?.['dataFrom'];
      const dataFrom = typeof from === 'string' && isValidIsoDate(from) ? from : null;
      // Nur ein gültiges Datum erscheint im Text (sonst „Für den  liegen …“)
      const message = isValidIsoDate(date)
        ? `Für den ${formatDateDe(date)} liegen keine Daten vor.` +
          (dataFrom ? ` Daten gibt es ab dem ${formatDateDe(dataFrom)}.` : '')
        : apiError.message;
      return { state: 'error', data: null, message, apiError, fieldError: null };
    }
    if (apiError.statusCode === 0 || apiError.statusCode >= 500) {
      return { state: 'error', data: null, message: UNREACHABLE_MESSAGE, apiError, fieldError: null };
    }
    const fieldError = apiError.statusCode === 400
      ? apiError.errors.find(e => e.field === 'date')?.message ?? null
      : null;
    return { state: 'error', data: null, message: apiError.message, apiError, fieldError };
  }

  private applyResult(result: DayResult): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.apiError.set(result.apiError);
    this.serverFieldError.set(result.fieldError);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (V02, F03)
    if (result.state !== 'loading') this.dayData.set(result.data);
  }
}
