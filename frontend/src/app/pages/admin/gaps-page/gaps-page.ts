import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Observable, catchError, finalize, map, of, startWith, switchMap } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { WeatherService } from '../../../services/weather.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ApiError, Gap } from '../../../models/api';
import type { LoadState } from '../../../models/load-state';
import { applyServerErrors } from '../../../utils/apply-server-errors';
import { addDays } from '../../../utils/berlin-date';
import { GAP_REASON_LABEL, formatLocalDateTime, formatPeriod, hoursLabel } from '../../../utils/admin-format';
import { DateRangeErrors, hasDateRangeErrors, validateDateRange } from '../../../utils/date-range';
import { CardComponent } from '../../../components/card/card';
import { FormFieldComponent } from '../../../components/form-field/form-field';
import { DataTableColumn, DataTableComponent, DataTableRow } from '../../../components/data-table/data-table';
import { LoadingComponent } from '../../../components/state/loading';
import { EmptyComponent } from '../../../components/state/empty';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';
import { ImportFeedback, ImportFeedbackComponent, importFeedbackFromError } from '../import-feedback/import-feedback';

/** Standardzeitraum: die letzten 7 Kalendertage bis heute (heute mitgezählt). */
export const DEFAULT_GAP_DAYS = 7;
export const GAPS_ERROR_MESSAGE = 'Die Lücken konnten nicht geladen werden.';
export const TODAY_ERROR_MESSAGE = 'Der Datenstand konnte nicht geladen werden.';

type GapField = 'from' | 'to';

/** Ab 768 px: Von, Bis, Stunden, Grund. */
export const GAP_COLUMNS: readonly DataTableColumn[] = [
  { key: 'from', label: 'Von', rowHeader: true },
  { key: 'to', label: 'Bis' },
  { key: 'hours', label: 'Stunden', align: 'end' },
  { key: 'reason', label: 'Grund' },
];

/**
 * Unter 768 px drei Spalten, Von und Bis in einer Zelle, damit die Seite nicht seitlich scrollt.
 * Bewusst `<td>` statt Zeilenkopf: `tbody th` bricht nicht um (`nowrap`), die Zelle hier schon.
 */
export const GAP_COLUMNS_NARROW: readonly DataTableColumn[] = [
  { key: 'range', label: 'Zeitraum' },
  { key: 'hours', label: 'Std.', align: 'end' },
  { key: 'reason', label: 'Grund' },
];

export function gapRow(gap: Gap): DataTableRow {
  const from = formatLocalDateTime(gap.from);
  const to = formatLocalDateTime(gap.to);
  return {
    from,
    to,
    range: gap.from === gap.to ? from : `${from} bis ${to}`,
    hours: gap.hours,
    reason: GAP_REASON_LABEL[gap.reason] ?? gap.reason,
  };
}

interface GapQuery {
  from: string;
  to: string;
}

interface GapsResult {
  state: LoadState;
  query: GapQuery;
  items: Gap[];
  message: string | null;
  apiError: ApiError | null;
  retryable: boolean;
}

/**
 * Lücken `/admin/luecken` (US12; 02 E3.7.5).
 *
 * - Heute kommt vom Server (`/api/status.today`), nicht von der Uhr des Browsers. Standard: die
 *   letzten 7 Tage bis heute; danach lädt die Seite sofort `GET /api/gaps?from&to`.
 * - Formular Von/Bis wie beim Import (`validateDateRange`, Meldung am Feld „Bis“), 400 mit
 *   `errors[].field` → am Feld.
 * - Tabelle Von, Bis, Stunden, Grund; unter 768 px drei Spalten (Zeitraum in einer Zelle), die Seite
 *   scrollt nicht seitlich.
 * - „Nachladen“ startet `POST /api/imports` mit `kind: "gaps"` für den **angezeigten** Zeitraum (US12-3)
 *   und zeigt die Box „ERFOLG – Import #… gestartet.“ mit Link; 409 `IMPORT_RUNNING` mit Link auf den
 *   laufenden Import.
 */
@Component({
  selector: 'app-gaps-page',
  imports: [
    ReactiveFormsModule, CardComponent, FormFieldComponent, DataTableComponent, LoadingComponent, EmptyComponent,
    ErrorComponent, SkeletonComponent, ImportFeedbackComponent,
  ],
  templateUrl: './gaps-page.html',
  styleUrl: './gaps-page.css',
})
export class GapsPageComponent {
  private api = inject(AdminApiService);
  private weather = inject(WeatherService);
  private document = inject(DOCUMENT);

  readonly columns = GAP_COLUMNS;
  readonly columnsNarrow = GAP_COLUMNS_NARROW;

  readonly form = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  /** Berliner Heute laut Server; `null` solange es lädt oder wenn `/api/status` fehlschlägt. */
  readonly today = signal<string | null>(null);
  readonly todayState = signal<LoadState>('loading');

  readonly submitted = signal(false);
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  readonly clientErrors = computed<DateRangeErrors>(() => {
    if (!this.submitted()) return {};
    const { from, to } = this.formValue();
    return validateDateRange(from, to, this.today());
  });

  /** Angezeigter Zeitraum (letzte erfolgreiche Abfrage). */
  readonly query = signal<GapQuery | null>(null);
  private readonly reloadCount = signal(0);
  private readonly request = computed(() => ({ query: this.query(), reload: this.reloadCount() }));

  readonly state = signal<LoadState>('idle');
  readonly gaps = signal<Gap[] | null>(null);
  /** Zeitraum, zu dem `gaps` gehört (bleibt beim Nachladen stehen). */
  readonly shownQuery = signal<GapQuery | null>(null);
  readonly apiError = signal<ApiError | null>(null);
  readonly error = signal<string | null>(null);
  readonly retryable = signal(false);

  readonly rows = computed(() => (this.gaps() ?? []).map(gapRow));
  readonly totalHours = computed(() => (this.gaps() ?? []).reduce((sum, gap) => sum + gap.hours, 0));
  readonly shownPeriod = computed(() => {
    const q = this.shownQuery();
    return q ? formatPeriod(q.from, q.to) : '';
  });

  readonly pending = signal(false);
  readonly feedback = signal<ImportFeedback | null>(null);
  readonly hoursLabel = hoursLabel;
  readonly todayError = TODAY_ERROR_MESSAGE;

  constructor() {
    this.loadToday();
    toObservable(this.request).pipe(
      switchMap(({ query }) => (query ? this.loadGaps(query) : EMPTY)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  fieldError(field: GapField): string | null {
    return this.clientErrors()[field] ?? null;
  }

  /** „Lücken anzeigen“: prüft den Zeitraum und lädt ihn. */
  submit(): void {
    this.submitted.set(true);
    for (const control of Object.values(this.form.controls)) control.updateValueAndValidity();
    const { from, to } = this.form.getRawValue();
    const errors = validateDateRange(from, to, this.today());
    if (hasDateRangeErrors(errors)) {
      this.focusField(errors.from ? 'from' : 'to');
      return;
    }
    this.feedback.set(null);
    const current = this.query();
    if (current && current.from === from && current.to === to) this.reloadCount.update(n => n + 1);
    else this.query.set({ from, to });
  }

  /** „Erneut versuchen“: Datenstand bzw. Lücken neu laden. */
  retry(): void {
    if (this.todayState() === 'error') this.loadToday();
    else this.reloadCount.update(n => n + 1);
  }

  /** „Nachladen“ (US12-3): `gaps`-Import für den angezeigten Zeitraum. */
  reload(): void {
    const q = this.shownQuery();
    if (!q || this.pending()) return;
    this.feedback.set(null);
    this.pending.set(true);
    this.api.createImport({ kind: 'gaps', from: q.from, to: q.to }).pipe(finalize(() => this.pending.set(false))).subscribe({
      next: created => this.feedback.set({ type: 'started', importId: created.id }),
      error: (error: unknown) => this.feedback.set(importFeedbackFromError(error)),
    });
  }

  private loadToday(): void {
    this.todayState.set('loading');
    this.weather.getStatus().subscribe({
      next: status => {
        this.today.set(status.today);
        this.todayState.set('success');
        // Standardzeitraum nur, solange nichts eingegeben und nichts geladen ist; dann sofort laden.
        if (this.query() || !this.form.pristine) return;
        const range = { from: addDays(status.today, -(DEFAULT_GAP_DAYS - 1)), to: status.today };
        this.form.setValue(range);
        this.query.set(range);
      },
      error: () => this.todayState.set('error'),
    });
  }

  private loadGaps(query: GapQuery): Observable<GapsResult> {
    return this.api.getGaps(query.from, query.to).pipe(
      map((list): GapsResult => ({
        state: list.items.length ? 'success' : 'empty', query, items: list.items, message: null, apiError: null, retryable: false,
      })),
      catchError(error => of(this.errorResult(query, error))),
      startWith<GapsResult>({ state: 'loading', query, items: [], message: null, apiError: null, retryable: false }),
    );
  }

  private applyResult(result: GapsResult): void {
    this.state.set(result.state);
    this.error.set(result.message);
    this.apiError.set(result.apiError);
    this.retryable.set(result.retryable);
    if (result.state === 'loading') return;
    if (result.state === 'error' || result.state === 'idle') {
      this.gaps.set(null);
      this.shownQuery.set(null);
      return;
    }
    this.gaps.set(result.items);
    this.shownQuery.set(result.query);
  }

  /**
   * 400 mit Feldbezug → Meldung am Feld (`applyServerErrors`), ohne Fehlerbox (`idle`); Fehler ohne
   * passendes Feld → Fehlerbox ohne „Erneut versuchen“. Sonst Fehlerbox mit „Erneut versuchen“.
   */
  private errorResult(query: GapQuery, error: unknown): GapsResult {
    const apiError = apiErrorOf(error);
    const base = { query, items: [], apiError };
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const unmatched = applyServerErrors(error, this.form);
      const first = (['from', 'to'] as const).find(name => this.form.controls[name].invalid);
      if (first) this.focusField(first);
      if (unmatched.length === 0 && apiError.errors.length > 0) {
        return { ...base, state: 'idle', message: null, retryable: false };
      }
      return { ...base, state: 'error', message: unmatched.map(e => e.message).join(' ') || apiError.message, retryable: false };
    }
    return { ...base, state: 'error', message: GAPS_ERROR_MESSAGE, retryable: true };
  }

  private focusField(field: GapField): void {
    setTimeout(() => this.document.getElementById(`gaps-${field}`)?.focus());
  }
}
