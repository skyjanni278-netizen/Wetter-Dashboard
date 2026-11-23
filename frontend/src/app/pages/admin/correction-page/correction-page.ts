import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../../services/weather.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ApiError, Day, DayHour } from '../../../models/api';
import type { LoadState } from '../../../models/load-state';
import { formatDateDe, isValidIsoDate } from '../../../utils/berlin-date';
import { formatCorrectionValue, hourLabel } from '../../../utils/correction-format';
import { describeWeather, getWindDirection } from '../../../utils/weather-icon';
import { CardComponent } from '../../../components/card/card';
import { ChipComponent } from '../../../components/chip/chip';
import { LoadingComponent } from '../../../components/state/loading';
import { EmptyComponent } from '../../../components/state/empty';
import { ErrorComponent } from '../../../components/state/error';
import { NoticeComponent } from '../../../components/notice/notice';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';
import { HourCorrectionComponent } from './hour-correction';

export const CORRECTION_DAY_ERROR_MESSAGE = 'Die Stunden des Tages konnten nicht geladen werden.';

interface DayResult {
  state: LoadState;
  day: Day | null;
  apiError: ApiError | null;
}

/**
 * Korrektur eines Tages `/admin/korrektur/:date` (N03, US13-2, US13-16; 02 E3.9 „Neu: Admin“).
 *
 * - Stunden aus `GET /api/days/:date` (IDs aus `hours[].id`). Jede vergangene Stunde hat den Button
 *   „Korrigieren“ (Disclosure mit `aria-expanded`); darunter öffnet sich `app-hour-correction` mit Formular
 *   und Historie. Vorhersagestunden sind nicht korrigierbar (R08, 409) und tragen den Chip „VORHERSAGE“.
 * - Korrigierte Stunden tragen den Chip „KORRIGIERT“ (wie die Gastansicht, US13-12).
 * - Nach einer Korrektur oder Rücknahme lädt die Seite den Tag neu (frische Werte und Chips); offene
 *   Stunden bleiben offen (`track hour.id`).
 * - Ungültiges Datum → Hinweis ohne Request; 404 `NO_DATA` → Leerzustand; 400 (z. B. Zukunft) → Meldung der
 *   API; sonst Fehlerbox mit „Erneut versuchen“.
 */
@Component({
  selector: 'app-correction-page',
  imports: [
    RouterLink, CardComponent, ChipComponent, LoadingComponent, EmptyComponent, ErrorComponent, NoticeComponent,
    SkeletonComponent, HourCorrectionComponent,
  ],
  templateUrl: './correction-page.html',
  styleUrl: './correction-page.css',
})
export class CorrectionPageComponent {
  private weather = inject(WeatherService);

  /** Route-Parameter `:date` (`YYYY-MM-DD`). */
  readonly date = input<string | undefined>(undefined);

  readonly validDate = computed(() => {
    const date = this.date();
    return date && isValidIsoDate(date) ? date : null;
  });
  readonly dateLabel = computed(() => {
    const date = this.validDate();
    return date ? formatDateDe(date) : null;
  });

  readonly state = signal<LoadState>('idle');
  readonly day = signal<Day | null>(null);
  readonly apiError = signal<ApiError | null>(null);
  readonly errorMessage = CORRECTION_DAY_ERROR_MESSAGE;

  /** Geöffnete Stunden (`observation.id`). */
  readonly open = signal<ReadonlySet<number>>(new Set());

  readonly hourLabel = hourLabel;

  private readonly reloadCount = signal(0);

  constructor() {
    combineLatest([toObservable(this.validDate), toObservable(this.reloadCount)]).pipe(
      switchMap(([date]) => (date ? this.load(date) : of<DayResult>({ state: 'idle', day: null, apiError: null }))),
      takeUntilDestroyed(),
    ).subscribe(result => {
      this.state.set(result.state);
      this.apiError.set(result.apiError);
      // Beim Nachladen bleibt der Tag stehen (Karte `busy`), bei Fehler und Leer entfällt er (B5.2).
      if (result.state !== 'loading') this.day.set(result.day);
    });
  }

  /** „Erneut versuchen“ und nach jeder Korrektur: Tag neu laden. */
  reloadDay(): void {
    this.reloadCount.update(n => n + 1);
  }

  toggle(hour: DayHour): void {
    this.open.update(current => {
      const next = new Set(current);
      if (next.has(hour.id)) next.delete(hour.id);
      else next.add(hour.id);
      return next;
    });
  }

  isOpen(hour: DayHour): boolean {
    return this.open().has(hour.id);
  }

  panelId(hour: DayHour): string {
    return `hour-panel-${hour.id}`;
  }

  /** Kurzfassung der Werte: „9,6 °C · gefühlt 5,1 °C · 0,4 mm · Regen · 21,3 km/h aus SW“. */
  summary(hour: DayHour): string {
    const wind = hour.windSpeed === null
      ? 'Wind unbekannt'
      : `${formatCorrectionValue('windSpeed', hour.windSpeed)}${hour.windDirection === null ? '' : ` aus ${getWindDirection(hour.windDirection)}`}`;
    return [
      formatCorrectionValue('temperature', hour.temperature),
      `gefühlt ${formatCorrectionValue('apparentTemperature', hour.apparentTemperature)}`,
      formatCorrectionValue('precipitation', hour.precipitation),
      describeWeather(hour.weatherCode),
      wind,
    ].join(' · ');
  }

  /** 400 (z. B. `DATE_IN_FUTURE`) und 404 lassen sich nicht durch Wiederholen beheben. */
  readonly retryable = computed(() => {
    const error = this.apiError();
    return !error || (error.statusCode !== 400 && error.statusCode !== 404);
  });

  private load(date: string): Observable<DayResult> {
    return this.weather.getDay(date).pipe(
      map((day): DayResult => (day.hours.length ? { state: 'success', day, apiError: null } : { state: 'empty', day: null, apiError: null })),
      catchError(error => {
        const apiError = apiErrorOf(error);
        return of<DayResult>(apiError.statusCode === 404
          ? { state: 'empty', day: null, apiError }
          : { state: 'error', day: null, apiError });
      }),
      startWith<DayResult>({ state: 'loading', day: null, apiError: null }),
    );
  }
}
