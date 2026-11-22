import { Component, DOCUMENT, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Observable, catchError, finalize, map, of, startWith, switchMap } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { WeatherService } from '../../../services/weather.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ImportList, ImportStatus } from '../../../models/api';
import type { LoadResult, LoadState } from '../../../models/load-state';
import { applyServerErrors } from '../../../utils/apply-server-errors';
import {
  IMPORT_STATUS_LABEL, IMPORT_STATUS_VALUES, IMPORTS_PAGE_SIZE, isImportStatus, parsePageParam,
} from '../../../utils/admin-format';
import { DateRangeErrors, hasDateRangeErrors, validateDateRange } from '../../../utils/date-range';
import { CardComponent } from '../../../components/card/card';
import { FormFieldComponent } from '../../../components/form-field/form-field';
import { DataTableComponent } from '../../../components/data-table/data-table';
import { LoadingComponent } from '../../../components/state/loading';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';
import { ImportFeedback, ImportFeedbackComponent, importFeedbackFromError } from '../import-feedback/import-feedback';
import { IMPORT_COLUMNS, IMPORT_COLUMNS_NARROW, importRow } from '../import-table';

export const IMPORTS_ERROR_MESSAGE = 'Das Importprotokoll konnte nicht geladen werden.';

type ImportField = 'from' | 'to';

interface ListRequest {
  page: number;
  status: ImportStatus | null;
  reload: number;
}

/**
 * Importe `/admin/importe` (US10, US11; 02 E3.7.3, E3.7.5, E3.7.7).
 *
 * - Formular „Import starten“: Von, Bis, Art (`range`/`gaps`). Prüfung beim Absenden im Browser
 *   (`validateDateRange`: Pflicht, Bis vor Von, Spanne, nach heute laut `/api/status`) → Meldung am
 *   Feld mit `aria-invalid`/`aria-describedby`, Fokus aufs erste Feld, kein Request. 400 mit
 *   `errors[].field` → Meldung am Feld (`applyServerErrors`), 409 `IMPORT_RUNNING` → Meldung mit Link
 *   auf den laufenden Import, Erfolg (202) → Box „ERFOLG – Import #… gestartet.“ mit Link.
 * - Protokoll: `GET /api/imports?page&limit=20[&status]`, Seite aus `?seite=` (1-basiert, ungültig → 1),
 *   Filter aus `?status=` (unbekannt → alle). Beide stehen nur in der URL; Blättern und Filter
 *   navigieren per Router. `meta.total` steht über der Tabelle.
 */
@Component({
  selector: 'app-imports-page',
  imports: [
    ReactiveFormsModule, RouterLink, CardComponent, FormFieldComponent, DataTableComponent, LoadingComponent,
    ErrorComponent, SkeletonComponent, ImportFeedbackComponent,
  ],
  templateUrl: './imports-page.html',
  styleUrl: './imports-page.css',
})
export class ImportsPageComponent {
  private api = inject(AdminApiService);
  private weather = inject(WeatherService);
  private router = inject(Router);
  private document = inject(DOCUMENT);

  /** Query `?seite=` (per `withComponentInputBinding()`). */
  readonly seite = input<string | undefined>(undefined);
  /** Query `?status=` (Filter). */
  readonly status = input<string | undefined>(undefined);

  readonly page = computed(() => parsePageParam(this.seite()));
  readonly statusFilter = computed<ImportStatus | null>(() => {
    const value = this.status();
    return isImportStatus(value) ? value : null;
  });

  readonly statusOptions = IMPORT_STATUS_VALUES.map(value => ({ value, label: IMPORT_STATUS_LABEL[value] }));
  readonly statusFilterLabel = computed(() => {
    const status = this.statusFilter();
    return status ? IMPORT_STATUS_LABEL[status] : null;
  });
  readonly columns = IMPORT_COLUMNS;
  readonly columnsNarrow = IMPORT_COLUMNS_NARROW;

  // ---------- Formular ----------
  readonly form = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    kind: new FormControl<'range' | 'gaps'>('range', { nonNullable: true }),
  });

  /** Berliner Heute laut Server (`/api/status`): `max` der Datumsfelder und Prüfung „nicht nach heute“. */
  readonly today = toSignal(
    this.weather.getStatus().pipe(map(s => s.today), catchError(() => of(null))),
    { initialValue: null },
  );

  readonly submitted = signal(false);
  readonly pending = signal(false);
  readonly feedback = signal<ImportFeedback | null>(null);

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** Client-Fehler je Feld, erst nach dem ersten Absenden und danach live. */
  readonly clientErrors = computed<DateRangeErrors>(() => {
    if (!this.submitted()) return {};
    const { from, to } = this.formValue();
    return validateDateRange(from, to, this.today());
  });

  // ---------- Protokoll ----------
  readonly list = signal<ImportList | null>(null);
  readonly listState = signal<LoadState>('idle');
  readonly listError = signal<string | null>(null);
  readonly listApiMessage = signal<string | null>(null);

  private readonly reloadCount = signal(0);
  private readonly listRequest = computed<ListRequest>(() => ({
    page: this.page(),
    status: this.statusFilter(),
    reload: this.reloadCount(),
  }));

  readonly rows = computed(() => (this.list()?.items ?? []).map(importRow));
  readonly total = computed(() => this.list()?.meta.total ?? 0);
  readonly pageCount = computed(() => {
    const meta = this.list()?.meta;
    return meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
  });
  readonly emptyText = computed(() => {
    if (this.page() > this.pageCount()) return 'Auf dieser Seite gibt es keine Einträge.';
    return this.statusFilter() ? 'Keine Importe mit diesem Status.' : 'Noch keine Importe.';
  });
  readonly hasPrevious = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.pageCount());

  constructor() {
    toObservable(this.listRequest).pipe(
      switchMap(request => this.loadList(request)),
      takeUntilDestroyed(),
    ).subscribe(result => {
      this.listState.set(result.state);
      this.listError.set(result.message);
      if (result.state === 'error') this.list.set(null);
      else if (result.state === 'success') this.list.set(result.data);
    });
  }

  fieldError(field: ImportField): string | null {
    return this.clientErrors()[field] ?? null;
  }

  submit(): void {
    if (this.pending()) return;
    this.submitted.set(true);
    this.feedback.set(null);
    // Alte Server-Fehler verwerfen: die Validatoren neu laufen lassen.
    for (const control of Object.values(this.form.controls)) control.updateValueAndValidity();

    const { from, to, kind } = this.form.getRawValue();
    const errors = validateDateRange(from, to, this.today());
    if (hasDateRangeErrors(errors)) {
      this.focusField(errors.from ? 'from' : 'to');
      return;
    }

    this.pending.set(true);
    this.api.createImport({ kind, from, to }).pipe(finalize(() => this.pending.set(false))).subscribe({
      next: created => {
        this.feedback.set({ type: 'started', importId: created.id });
        this.reloadCount.update(n => n + 1);
      },
      error: (error: unknown) => this.showSubmitError(error),
    });
  }

  /** „Erneut versuchen“ am Protokoll. */
  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  /** Filter nach Status (US11-2); setzt die Seite zurück. */
  setStatusFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate([], {
      queryParams: { status: isImportStatus(value) ? value : null, seite: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Query für einen Seitenlink; Seite 1 ohne Parameter. */
  pageQuery(page: number): Record<string, number | null> {
    return { seite: page > 1 ? page : null };
  }

  private showSubmitError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const apiError = apiErrorOf(error);
      const unmatched = applyServerErrors(error, this.form);
      const matchedAny = apiError.errors.length > unmatched.length;
      if (unmatched.length > 0 || !matchedAny) {
        this.feedback.set({ type: 'error', message: unmatched.map(e => e.message).join(' ') || apiError.message });
      }
      const first = (['from', 'to', 'kind'] as const).find(name => this.form.controls[name].invalid);
      if (first) this.focusField(first);
      return;
    }
    this.feedback.set(importFeedbackFromError(error));
  }

  private focusField(field: ImportField | 'kind'): void {
    // Nach dem Rendern, damit aria-invalid/aria-describedby schon gesetzt sind.
    setTimeout(() => this.document.getElementById(`import-${field}`)?.focus());
  }

  private loadList(request: ListRequest): Observable<LoadResult<ImportList>> {
    return this.api.getImports({
      page: request.page,
      limit: IMPORTS_PAGE_SIZE,
      ...(request.status ? { status: request.status } : {}),
    }).pipe(
      map((list): LoadResult<ImportList> => ({ state: 'success', data: list, message: null })),
      catchError(error => {
        this.listApiMessage.set(apiErrorOf(error).message);
        return of<LoadResult<ImportList>>({ state: 'error', data: null, message: IMPORTS_ERROR_MESSAGE });
      }),
      startWith<LoadResult<ImportList>>({ state: 'loading', data: null, message: null }),
    );
  }
}
