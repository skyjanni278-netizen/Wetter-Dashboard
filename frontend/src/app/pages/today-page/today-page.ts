import { Component, DestroyRef, ElementRef, OnInit, signal, computed, effect, inject, input, linkedSignal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { DayData, DayForecast } from '../../models/weather';
import { LoadResult, LoadState } from '../../models/load-state';
import { ClimateChartComponent, ClimateChartDataset } from '../../components/climate-chart/climate-chart';
import { getWeatherIcon, describeWeather, getWindDirection } from '../../utils/weather-icon';
import { berlinToday, berlinHour, addDays, formatDateDe, isValidIsoDate } from '../../utils/berlin-date';
import { DATA_START } from '../../config/data-range';
import { UnitPipe } from '../../pipes/unit.pipe';
import { dayViewTitle, setPageTitle } from '../../utils/page-title';
import { dayParamStatus } from '../../utils/route-params';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Pause, nach der ein getipptes Datum ohne Enter oder Verlassen des Felds übernommen wird. */
export const KEYBOARD_COMMIT_DELAY_MS = 800;

@Component({
  selector: 'app-today-page',
  standalone: true,
  imports: [DecimalPipe, UnitPipe, ClimateChartComponent, RouterLink],
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

  dayData = signal<DayData | null>(null);
  forecast = signal<DayForecast[]>([]);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);

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
    this.weather.getForecast().subscribe({ next: f => this.forecast.set(f), error: () => {} });
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

  private loadDay(date: string): Observable<LoadResult<DayData>> {
    const today = berlinToday();
    const status = dayParamStatus(date, today);
    // Ungültige Daten und Zukunftsdaten lösen keinen Request aus
    if (status === 'invalid' || status === 'future') {
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
      // Nur ein gültiges Datum erscheint im Text (sonst „Für den  liegen …“)
      const message = isValidIsoDate(date) && date < DATA_START
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
