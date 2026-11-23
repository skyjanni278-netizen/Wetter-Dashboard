import { Component, DOCUMENT, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { WeatherService } from '../../../services/weather.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type { ApiError, CorrectionList, CorrectionListItem } from '../../../models/api';
import type { LoadState } from '../../../models/load-state';
import type { DataTableColumn, DataTableRow } from '../../../components/data-table/data-table';
import { applyServerErrors } from '../../../utils/apply-server-errors';
import { addDays, isValidIsoDate } from '../../../utils/berlin-date';
import { IMPORTS_PAGE_SIZE, formatDateTimeBerlin, formatLocalDateTime, formatPeriod, parsePageParam } from '../../../utils/admin-format';
import { CORRECTION_FIELD_LABEL, formatCorrectionValue } from '../../../utils/correction-format';
import { DateRangeErrors, hasDateRangeErrors, validateDateRange } from '../../../utils/date-range';
import { CardComponent } from '../../../components/card/card';
import { FormFieldComponent } from '../../../components/form-field/form-field';
import { DataTableComponent } from '../../../components/data-table/data-table';
import { LoadingComponent } from '../../../components/state/loading';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';

/** Höchste Spanne der Übersicht (R23, wie `MAX_CORRECTION_DAYS` der API). */
export const MAX_CORRECTION_DAYS = 366;
/** Standardzeitraum: die letzten 30 Tage bis heute (heute mitgezählt). */
export const DEFAULT_CORRECTION_DAYS = 30;
/** Einträge je Seite (E3.7.5: ab 20 Zeilen blättern). */
export const CORRECTIONS_PAGE_SIZE = IMPORTS_PAGE_SIZE;
export const CORRECTIONS_ERROR_MESSAGE = 'Die Korrekturen konnten nicht geladen werden.';
export const CORRECTIONS_TODAY_ERROR_MESSAGE = 'Der Datenstand konnte nicht geladen werden.';

type RangeField = 'from' | 'to';

interface CorrectionsRequest {
  from: string;
  to: string;
  page: number;
  reload: number;
}

interface ListResult {
  state: LoadState;
  data: CorrectionList | null;
  apiError: ApiError | null;
}

/** Ab 768 px. */
export const CORRECTION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'hour', label: 'Stunde', rowHeader: true },
  { key: 'field', label: 'Wert' },
  { key: 'old', label: 'Alt', align: 'end' },
  { key: 'new', label: 'Neu', align: 'end' },
  { key: 'reason', label: 'Grund' },
  { key: 'correctedAt', label: 'Geändert am' },
  { key: 'kind', label: 'Art' },
];

/** Unter 768 px: Stunde, Änderung (mit Grund) und Art, damit die Seite nicht seitlich scrollt. */
export const CORRECTION_COLUMNS_NARROW: readonly DataTableColumn[] = [
  { key: 'hour', label: 'Stunde', rowHeader: true },
  { key: 'change', label: 'Änderung' },
  { key: 'kind', label: 'Art' },
];

/** Zeile der Übersicht: Stunde als Link auf `/admin/korrektur/:date` (Berliner Tag der Stunde). */
export function correctionRow(item: CorrectionListItem): DataTableRow {
  const date = item.observationTimeLocal.slice(0, 10);
  const hour = formatLocalDateTime(item.observationTimeLocal);
  const field = CORRECTION_FIELD_LABEL[item.field] ?? item.field;
  const oldValue = formatCorrectionValue(item.field, item.oldValue);
  const newValue = formatCorrectionValue(item.field, item.newValue);
  return {
    hour: { link: ['/admin/korrektur', date], text: hour, label: `${hour} Uhr korrigieren` },
    field,
    old: oldValue,
    new: newValue,
    reason: item.reason,
    correctedAt: formatDateTimeBerlin(item.correctedAt),
    change: `${field}: ${oldValue} → ${newValue}. Grund: ${item.reason}`,
    kind: item.revertsCorrectionId === null
      ? 'Korrektur'
      : { chip: `Rücknahme von #${item.revertsCorrectionId}` },
  };
}

/**
 * Übersicht aller Korrekturen `/admin/korrektur` (N03, US13-14/-15; 02 E3.7.5).
 *
 * - Zeitraum aus der URL: `?von=&bis=` (Berliner Tage von `correctedAt`), Seite aus `?seite=` (1-basiert,
 *   ungültig → 1). Ohne `von`/`bis` gelten die letzten 30 Tage bis heute laut Server (`/api/status`).
 * - Filter „Von“/„Bis“: Prüfung im Browser (`validateDateRange`, höchstens 366 Tage, nicht nach heute),
 *   Meldung am Feld; sonst **navigiert** er auf `?von&bis` (ohne `seite`), die URL trägt den Filter.
 * - `GET /api/corrections?from&to&page&limit=20`; Tabelle mit Link je Zeile auf `/admin/korrektur/:date`.
 *   400 mit Feldbezug → am Feld; sonst Fehlerbox mit „Erneut versuchen“.
 */
@Component({
  selector: 'app-corrections-page',
  imports: [
    ReactiveFormsModule, RouterLink, CardComponent, FormFieldComponent, DataTableComponent, LoadingComponent,
    ErrorComponent, SkeletonComponent,
  ],
  templateUrl: './corrections-page.html',
  styleUrl: './corrections-page.css',
})
export class CorrectionsPageComponent {
  private api = inject(AdminApiService);
  private weather = inject(WeatherService);
  private router = inject(Router);
  private document = inject(DOCUMENT);

  /** Query `?von=`, `?bis=`, `?seite=` (per `withComponentInputBinding()`). */
  readonly von = input<string | undefined>(undefined);
  readonly bis = input<string | undefined>(undefined);
  readonly seite = input<string | undefined>(undefined);

  readonly columns = CORRECTION_COLUMNS;
  readonly columnsNarrow = CORRECTION_COLUMNS_NARROW;
  readonly todayErrorMessage = CORRECTIONS_TODAY_ERROR_MESSAGE;
  readonly errorMessage = CORRECTIONS_ERROR_MESSAGE;

  /** Heute laut Server; `null` solange `/api/status` lädt bzw. bei Fehler. */
  readonly today = signal<string | null>(null);
  readonly todayState = signal<LoadState>('loading');

  readonly page = computed(() => parsePageParam(this.seite()));

  /** Zeitraum aus der URL, fehlende Teile aus dem Standard; `null` solange heute noch fehlt. */
  readonly range = computed<{ from: string; to: string } | null>(() => {
    const von = this.von();
    const bis = this.bis();
    const today = this.today();
    const to = bis ?? today;
    if (!to) return null;
    const from = von ?? (isValidIsoDate(to) ? addDays(to, -(DEFAULT_CORRECTION_DAYS - 1)) : to);
    return { from, to };
  });

  /** Prüfung des Zeitraums aus der URL (ungültig → kein Request, Meldung am Feld). */
  readonly urlErrors = computed<DateRangeErrors>(() => {
    const range = this.range();
    return range ? validateDateRange(range.from, range.to, this.today(), MAX_CORRECTION_DAYS) : {};
  });

  // ---------- Filter ----------
  readonly form = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });
  readonly submitted = signal(false);
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  /** Fehler je Feld: nach „Anzeigen“ live aus dem Formular, sonst die des Zeitraums aus der URL. */
  readonly clientErrors = computed<DateRangeErrors>(() => {
    if (!this.submitted()) return this.urlErrors();
    const { from, to } = this.formValue();
    return validateDateRange(from, to, this.today(), MAX_CORRECTION_DAYS);
  });

  // ---------- Liste ----------
  readonly state = signal<LoadState>('idle');
  readonly list = signal<CorrectionList | null>(null);
  readonly apiError = signal<ApiError | null>(null);
  /** Zeitraum, zu dem `list` gehört (bleibt beim Nachladen stehen). */
  readonly shownRange = signal<{ from: string; to: string } | null>(null);

  private readonly reloadCount = signal(0);
  private readonly request = computed<CorrectionsRequest | null>(() => {
    const range = this.range();
    if (!range || hasDateRangeErrors(this.urlErrors())) return null;
    return { ...range, page: this.page(), reload: this.reloadCount() };
  });

  readonly rows = computed(() => (this.list()?.items ?? []).map(correctionRow));
  readonly total = computed(() => this.list()?.meta.total ?? 0);
  readonly pageCount = computed(() => {
    const meta = this.list()?.meta;
    return meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
  });
  readonly hasPrevious = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.pageCount());
  readonly shownPeriod = computed(() => {
    const range = this.shownRange();
    return range ? formatPeriod(range.from, range.to) : '';
  });
  readonly emptyText = computed(() =>
    this.page() > this.pageCount() ? 'Auf dieser Seite gibt es keine Einträge.' : 'Keine Korrekturen in diesem Zeitraum.');
  /** 400 (Zeitraum) lässt sich durch Wiederholen nicht beheben. */
  readonly retryable = computed(() => this.apiError()?.statusCode !== 400);
  /** Fehlerbox nur ohne Feldbezug; 400 an `from`/`to` steht am Feld. */
  readonly showErrorBox = computed(() => {
    const error = this.apiError();
    if (this.state() !== 'error' || !error) return false;
    return !(error.statusCode === 400 && error.errors.some(e => e.field === 'from' || e.field === 'to'));
  });

  constructor() {
    this.loadToday();

    // Das Formular zeigt immer den Zeitraum der URL (auch nach Zurück/Vor im Browser).
    effect(() => {
      const range = this.range();
      if (!range) return;
      untracked(() => {
        this.form.setValue(range);
        this.submitted.set(false);
      });
    });

    toObservable(this.request).pipe(
      distinctUntilChanged((a, b) =>
        a === b || (!!a && !!b && a.from === b.from && a.to === b.to && a.page === b.page && a.reload === b.reload)),
      switchMap(request => (request ? this.load(request) : EMPTY)),
      takeUntilDestroyed(),
    ).subscribe(result => this.applyResult(result));
  }

  fieldError(field: RangeField): string | null {
    return this.clientErrors()[field] ?? null;
  }

  /** „Anzeigen“: Zeitraum prüfen und in die URL schreiben (die URL trägt den Filter, US13-14). */
  submit(): void {
    this.submitted.set(true);
    for (const control of Object.values(this.form.controls)) control.updateValueAndValidity();
    const { from, to } = this.form.getRawValue();
    const errors = validateDateRange(from, to, this.today(), MAX_CORRECTION_DAYS);
    if (hasDateRangeErrors(errors)) {
      this.focusField(errors.from ? 'from' : 'to');
      return;
    }
    const range = this.range();
    if (range && range.from === from && range.to === to && this.von() && this.bis() && this.page() === 1) {
      this.reloadCount.update(n => n + 1);
      return;
    }
    void this.router.navigate([], { queryParams: { von: from, bis: to, seite: null }, queryParamsHandling: 'merge' });
  }

  /** „Erneut versuchen“: Datenstand bzw. Liste neu laden. */
  retry(): void {
    if (this.todayState() === 'error') this.loadToday();
    else this.reloadCount.update(n => n + 1);
  }

  /** Query für einen Seitenlink; Seite 1 ohne Parameter, der Zeitraum bleibt (`merge`). */
  pageQuery(page: number): Record<string, number | null> {
    return { seite: page > 1 ? page : null };
  }

  private loadToday(): void {
    this.todayState.set('loading');
    this.weather.getStatus().subscribe({
      next: status => {
        this.today.set(status.today);
        this.todayState.set('success');
      },
      error: () => this.todayState.set('error'),
    });
  }

  private load(request: CorrectionsRequest): Observable<ListResult & { range: { from: string; to: string } }> {
    const range = { from: request.from, to: request.to };
    return this.api.getCorrections({ ...range, page: request.page, limit: CORRECTIONS_PAGE_SIZE }).pipe(
      map(data => ({ state: 'success' as LoadState, data, apiError: null, range })),
      catchError(error => {
        // 400 mit Feldbezug (`from`/`to`) erscheint am Feld (B5.2).
        if (error instanceof HttpErrorResponse && error.status === 400) applyServerErrors(error, this.form);
        return of({ state: 'error' as LoadState, data: null, apiError: apiErrorOf(error), range });
      }),
      startWith({ state: 'loading' as LoadState, data: null, apiError: null, range }),
    );
  }

  private applyResult(result: ListResult & { range: { from: string; to: string } }): void {
    this.state.set(result.state);
    this.apiError.set(result.apiError);
    if (result.state === 'loading') return;
    this.list.set(result.data);
    this.shownRange.set(result.data ? result.range : null);
  }

  private focusField(field: RangeField): void {
    setTimeout(() => this.document.getElementById(`corrections-${field}`)?.focus());
  }
}
