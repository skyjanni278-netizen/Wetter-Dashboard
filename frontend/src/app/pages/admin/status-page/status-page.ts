import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { WeatherService } from '../../../services/weather.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ApiError, GapList, ImportList, Status, UpdateState } from '../../../models/api';
import type { LoadState } from '../../../models/load-state';
import type { ChipVariant } from '../../../components/chip/chip';
import { addDays, formatDateDe } from '../../../utils/berlin-date';
import { formatDateTimeBerlin, formatPeriod, hoursLabel } from '../../../utils/admin-format';
import { CardComponent } from '../../../components/card/card';
import { ChipComponent } from '../../../components/chip/chip';
import { DataTableComponent } from '../../../components/data-table/data-table';
import { LoadingComponent } from '../../../components/state/loading';
import { EmptyComponent } from '../../../components/state/empty';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';
import { IMPORT_COLUMNS, IMPORT_COLUMNS_NARROW, importRow } from '../import-table';

export const STATUS_ERROR_MESSAGE = 'Der Betriebsstatus konnte nicht geladen werden.';
/** Zeitraum der Lückenprüfung auf der Statusseite: heute − 30 Tage bis heute (US14-1). */
export const STATUS_GAP_DAYS = 30;
/** Zahl der letzten Importe (US14-1: `GET /api/imports?limit=10`). */
export const STATUS_IMPORT_LIMIT = 10;

/** Ergebnis von `GET /api/health`: 200, 503 mit `details.database = "error"` oder keine/andere Antwort. */
export type HealthState = 'ok' | 'database_error' | 'unreachable';

export interface StatusData {
  status: Status;
  imports: ImportList;
  gaps: GapList;
  gapsFrom: string;
  health: HealthState;
}

interface StatusResult {
  state: LoadState;
  data: StatusData | null;
  apiError: ApiError | null;
}

const UPDATE_STATE: Record<UpdateState, { label: string; variant: ChipVariant; text: string }> = {
  ok: { label: 'Läuft', variant: 'success', text: 'Der stündliche Abruf läuft.' },
  delayed: { label: 'Verzögert', variant: 'danger', text: 'Der letzte erfolgreiche Abruf liegt zu lange zurück.' },
  never: { label: 'Noch nie', variant: 'status', text: 'Es gab noch keinen erfolgreichen Abruf.' },
};

const HEALTH: Record<HealthState, { label: string; variant: ChipVariant; text: string }> = {
  ok: { label: 'OK', variant: 'success', text: 'Die Datenbank ist lesbar.' },
  database_error: { label: 'Fehler', variant: 'danger', text: 'Die Datenbank ist nicht lesbar.' },
  unreachable: { label: 'Unbekannt', variant: 'status', text: 'Die Betriebsprüfung hat nicht geantwortet.' },
};

/**
 * Admin-Startseite `/admin` (US14): auf einen Blick, ob der stündliche Abruf läuft, wann zuletzt ein
 * Import fehlschlug und wie viele Lücken es gibt.
 *
 * Requests (US14-1, -3): `GET /api/status`, danach parallel `GET /api/imports?limit=10`,
 * `GET /api/gaps?from=<heute−30>&to=<heute>` (heute laut Server) und `GET /api/health`.
 * Eine 503 von `health` ist ein Ergebnis (Chip „Fehler“), kein Seitenfehler. Fällt einer der anderen
 * Requests aus, zeigt die Seite die Fehlerbox mit „Erneut versuchen“ (alte Werte entfallen); bei 401
 * meldet der `authInterceptor` ab (US14-2). Leer: ohne gespeicherte Daten (`dataFrom = null`) ein
 * Hinweis statt des Zeitraums.
 */
@Component({
  selector: 'app-status-page',
  imports: [
    RouterLink, CardComponent, ChipComponent, DataTableComponent, LoadingComponent, EmptyComponent, ErrorComponent,
    SkeletonComponent,
  ],
  templateUrl: './status-page.html',
  styleUrl: './status-page.css',
})
export class StatusPageComponent {
  private api = inject(AdminApiService);
  private weather = inject(WeatherService);

  readonly state = signal<LoadState>('idle');
  readonly data = signal<StatusData | null>(null);
  readonly apiError = signal<ApiError | null>(null);
  readonly errorMessage = STATUS_ERROR_MESSAGE;

  readonly columns = IMPORT_COLUMNS;
  readonly columnsNarrow = IMPORT_COLUMNS_NARROW;
  readonly formatDateDe = formatDateDe;
  readonly formatDateTime = formatDateTimeBerlin;
  readonly hoursLabel = hoursLabel;

  readonly update = computed(() => {
    const data = this.data();
    return data ? UPDATE_STATE[data.status.updateState] ?? UPDATE_STATE.never : null;
  });
  readonly health = computed(() => {
    const data = this.data();
    return data ? HEALTH[data.health] : null;
  });
  readonly dataPeriod = computed(() => {
    const status = this.data()?.status;
    return status?.dataFrom && status.dataTo ? formatPeriod(status.dataFrom, status.dataTo) : null;
  });
  readonly gapPeriod = computed(() => {
    const data = this.data();
    return data ? formatPeriod(data.gapsFrom, data.status.today) : '';
  });
  readonly gapHours = computed(() => (this.data()?.gaps.items ?? []).reduce((sum, gap) => sum + gap.hours, 0));
  /** Letzter fehlgeschlagener Import unter den letzten zehn (Fehlertext nur für den Admin, US14-1). */
  readonly lastFailed = computed(() => this.data()?.imports.items.find(item => item.status === 'failed') ?? null);
  readonly importRows = computed(() => (this.data()?.imports.items ?? []).map(importRow));

  private readonly reloadCount = signal(0);

  constructor() {
    toObservable(this.reloadCount).pipe(
      switchMap(() => this.load()),
      takeUntilDestroyed(),
    ).subscribe(result => {
      this.state.set(result.state);
      this.apiError.set(result.apiError);
      if (result.state !== 'loading') this.data.set(result.data);
    });
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  private load(): Observable<StatusResult> {
    return this.weather.getStatus().pipe(
      switchMap(status => {
        const gapsFrom = addDays(status.today, -STATUS_GAP_DAYS);
        return forkJoin({
          imports: this.api.getImports({ limit: STATUS_IMPORT_LIMIT }),
          gaps: this.api.getGaps(gapsFrom, status.today),
          health: this.api.getHealth().pipe(
            map((): HealthState => 'ok'),
            catchError(err => of<HealthState>(apiErrorOf(err).details?.['database'] === 'error' ? 'database_error' : 'unreachable')),
          ),
        }).pipe(map(parts => ({ status, gapsFrom, ...parts })));
      }),
      map((data): StatusResult => ({ state: data.status.dataFrom ? 'success' : 'empty', data, apiError: null })),
      catchError(err => of<StatusResult>({ state: 'error', data: null, apiError: apiErrorOf(err) })),
      startWith<StatusResult>({ state: 'loading', data: null, apiError: null }),
    );
  }
}
