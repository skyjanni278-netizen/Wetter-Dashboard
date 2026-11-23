import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { WeatherService } from '../../services/weather.service';
import { ApiError, HourRecord, Records } from '../../models/api';
import { LoadResult, LoadState } from '../../models/load-state';
import { apiErrorOf } from '../../interceptors/api-error.interceptor';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card';
import { ChipComponent } from '../../components/chip/chip';
import { NoticeComponent } from '../../components/notice/notice';
import { LoadingComponent } from '../../components/state/loading';
import { EmptyComponent } from '../../components/state/empty';
import { ErrorComponent } from '../../components/state/error';
import { formatDateDe } from '../../utils/berlin-date';

export const RECORDS_ERROR_MESSAGE = 'Fehler beim Laden der Rekorde.';
export const RECORDS_EMPTY_MESSAGE = 'Noch keine Daten. Rekorde gibt es, sobald vollständige Tage gespeichert sind.';

interface RecordsResult extends LoadResult<Records> {
  apiError: ApiError | null;
}

/**
 * Rekorde (US06, E3.7.4) aus `GET /api/records`: höchster und niedrigster Stundenwert mit Datum und
 * Stunde, regenreichster Tag, längste Trockenperiode, je mit Link auf die Tagesansicht.
 * Zustände: Skelett beim Laden, Leer ohne Daten (alle Rekorde `null`, `daysCounted = 0`, US06-5),
 * Fehlerbox mit „Erneut versuchen“.
 */
@Component({
  selector: 'app-stats-page',
  standalone: true,
  imports: [RouterLink, KpiCardComponent, ChipComponent, NoticeComponent, LoadingComponent, EmptyComponent, ErrorComponent],
  templateUrl: './stats-page.html',
})
export class StatsPageComponent {
  private weather = inject(WeatherService);

  readonly formatDate = formatDateDe;
  readonly skeletonKickers = ['Heißester Tag', 'Kältester Tag', 'Regenreichster Tag', 'Längste Trockenperiode'];

  records = signal<Records | null>(null);
  state = signal<LoadState>('idle');
  loading = computed(() => this.state() === 'loading');
  error = signal<string | null>(null);
  apiError = signal<ApiError | null>(null);

  /** „Erneut versuchen“ erhöht den Zähler und lädt neu (B5.2). */
  private reloadCount = signal(0);

  constructor() {
    toObservable(this.reloadCount).pipe(
      switchMap(() => this.load()),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** „02.07.2026, 15:00 Uhr“ (Datum und Stunde des Stundenrekords). */
  recordTime(record: HourRecord): string {
    return `${formatDateDe(record.date)}, ${record.timeLocal.slice(11, 16)} Uhr`;
  }

  private load(): Observable<RecordsResult> {
    return this.weather.getRecords().pipe(
      map((records): RecordsResult => isEmpty(records)
        ? { state: 'empty', data: null, message: RECORDS_EMPTY_MESSAGE, apiError: null }
        : { state: 'success', data: records, message: null, apiError: null }),
      catchError(err => of<RecordsResult>({ state: 'error', data: null, message: RECORDS_ERROR_MESSAGE, apiError: apiErrorOf(err) })),
      startWith<RecordsResult>({ state: 'loading', data: null, message: null, apiError: null }),
    );
  }

  private applyResult(result: RecordsResult): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.apiError.set(result.apiError);
    // Bei loading bleiben vorhandene Daten sichtbar; bei empty/error werden sie null (F03)
    if (result.state !== 'loading') this.records.set(result.data);
  }
}

/** Keine Daten (US06-5): kein vollständiger Tag und kein einziger Rekord. */
function isEmpty(r: Records): boolean {
  return r.daysCounted === 0 && !r.hottest && !r.coldest && !r.wettestDay && !r.longestDryPeriod;
}
