import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, expand, map, of, startWith, switchMap, timer } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ApiError, ImportResource } from '../../../models/api';
import type { LoadState } from '../../../models/load-state';
import {
  IMPORT_KIND_LABEL, IMPORT_POLL_INTERVAL_MS, IMPORT_STATUS_LABEL, IMPORT_STATUS_VARIANT, formatDateTimeBerlin,
  formatPeriod, isActiveImport, parseImportId,
} from '../../../utils/admin-format';
import { CardComponent } from '../../../components/card/card';
import { ChipComponent } from '../../../components/chip/chip';
import { KpiCardComponent } from '../../../components/kpi-card/kpi-card';
import { NoticeComponent } from '../../../components/notice/notice';
import { LoadingComponent } from '../../../components/state/loading';
import { EmptyComponent } from '../../../components/state/empty';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';

export const IMPORT_ERROR_MESSAGE = 'Der Import konnte nicht geladen werden.';
export const INVALID_IMPORT_ID_MESSAGE = 'Die Import-Nummer ist ungültig. Sie muss eine positive ganze Zahl sein.';

interface DetailResult {
  state: LoadState;
  data: ImportResource | null;
  message: string | null;
  apiError: ApiError | null;
}

/**
 * Detailseite `/admin/importe/:id` (US11-1, 03 B3.5).
 *
 * - Lädt `GET /api/imports/:id` und fragt **alle 2 s** neu, solange der Status `queued` oder `running`
 *   ist. Der Chip wechselt dann z. B. von „LÄUFT“ auf „OK“ (Live-Region, `aria-live="polite"`).
 * - Das Polling endet beim Endzustand (`succeeded`, `partial`, `failed`), beim Verlassen der Seite
 *   (`takeUntilDestroyed`, `switchMap` beim Wechsel der Nummer) und bei jedem Fehler (kein Dauerfeuer
 *   bei 429 oder 401; bei 401 meldet der `authInterceptor` ab und leitet zur Anmeldung).
 * - Ungültige Nummer → Hinweis ohne Request; 404 → Leerzustand mit Link zum Protokoll;
 *   anderer Fehler → Fehlerbox mit „Erneut versuchen“ (startet das Polling neu).
 * - Zeigt Auftrag (Art, Zeitraum, Zeiten), Zähler, Warnungen und den Fehler des Imports.
 */
@Component({
  selector: 'app-import-detail-page',
  imports: [
    RouterLink, CardComponent, ChipComponent, KpiCardComponent, NoticeComponent, LoadingComponent, EmptyComponent,
    ErrorComponent, SkeletonComponent,
  ],
  templateUrl: './import-detail-page.html',
  styleUrl: './import-detail-page.css',
})
export class ImportDetailPageComponent {
  private api = inject(AdminApiService);

  /** Pfad-Parameter `:id` (per `withComponentInputBinding()`). */
  readonly id = input<string | undefined>(undefined);
  readonly importId = computed(() => parseImportId(this.id()));

  readonly data = signal<ImportResource | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly apiError = signal<ApiError | null>(null);

  readonly pollSeconds = IMPORT_POLL_INTERVAL_MS / 1000;
  readonly kindLabel = IMPORT_KIND_LABEL;
  readonly formatDateTime = formatDateTimeBerlin;
  readonly formatPeriod = formatPeriod;

  readonly statusLabel = computed(() => {
    const item = this.data();
    return item ? IMPORT_STATUS_LABEL[item.status] ?? item.status : '';
  });
  readonly statusVariant = computed(() => {
    const item = this.data();
    return item ? IMPORT_STATUS_VARIANT[item.status] ?? 'status' : 'status';
  });
  /** Wird gerade nachgefragt (Status `queued`/`running`). */
  readonly polling = computed(() => {
    const item = this.data();
    return item !== null && isActiveImport(item.status) && this.state() === 'success';
  });

  private readonly reloadCount = signal(0);
  private readonly request = computed(() => ({ id: this.importId(), reload: this.reloadCount() }));

  constructor() {
    toObservable(this.request).pipe(
      switchMap(({ id }) => (id === null ? of(this.invalid()) : this.watch(id))),
      takeUntilDestroyed(),
    ).subscribe(result => {
      this.state.set(result.state);
      this.error.set(result.message);
      this.apiError.set(result.apiError);
      if (result.state !== 'loading') this.data.set(result.data);
    });
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /**
   * Erst ein Request, danach je Antwort mit aktivem Status nach 2 s der nächste (`expand`). Ein Fehler
   * beendet die ganze Kette (`catchError` außen), also auch das Polling.
   */
  private watch(id: number): Observable<DetailResult> {
    const fetch = () => this.api.getImport(id);
    return fetch().pipe(
      expand(item => (isActiveImport(item.status) ? timer(IMPORT_POLL_INTERVAL_MS).pipe(switchMap(fetch)) : EMPTY)),
      map((item): DetailResult => ({ state: 'success', data: item, message: null, apiError: null })),
      catchError(err => {
        const apiError = apiErrorOf(err);
        if (apiError.statusCode === 404) {
          return of<DetailResult>({ state: 'empty', data: null, message: `Import #${id} gibt es nicht.`, apiError });
        }
        return of<DetailResult>({ state: 'error', data: null, message: IMPORT_ERROR_MESSAGE, apiError });
      }),
      startWith<DetailResult>({ state: 'loading', data: null, message: null, apiError: null }),
    );
  }

  private invalid(): DetailResult {
    return { state: 'idle', data: null, message: INVALID_IMPORT_ID_MESSAGE, apiError: null };
  }
}
