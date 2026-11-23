import {
  ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, OnInit, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, finalize, forkJoin, map } from 'rxjs';
import { AdminApiService } from '../../../services/admin-api.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import type {
  CorrectionField, CorrectionResource, ObservationPatch, ObservationResource, VersionedObservation,
} from '../../../models/api';
import { applyServerErrors } from '../../../utils/apply-server-errors';
import { formatDateTimeBerlin } from '../../../utils/admin-format';
import {
  CONFLICT_MESSAGE, CORRECTION_FIELDS, CORRECTION_FIELD_LABEL, MISSING_ETAG_MESSAGE, NOT_REVERSIBLE_MESSAGE,
  NO_CHANGE_MESSAGE, PREDICTION_MESSAGE, REASON_MAX_LENGTH, formatCorrectionValue, inputValue, parseCorrectionValue,
  reasonError, reversibleCorrectionIds, sameValue,
} from '../../../utils/correction-format';
import { WEATHER_CODE_VALUES, describeWeather } from '../../../utils/weather-icon';
import { FormFieldComponent } from '../../../components/form-field/form-field';
import { NoticeComponent } from '../../../components/notice/notice';
import { LoadingComponent } from '../../../components/state/loading';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';
import { ChipComponent } from '../../../components/chip/chip';

/** Rückmeldung oben in der Stunde (E3.7.7); der Fokus springt nach jeder Aktion dorthin. */
export type HourFeedback =
  | { type: 'success'; text: string }
  | { type: 'reloaded' }
  | { type: 'conflict' }
  | { type: 'error'; text: string };

export const HOUR_LOAD_ERROR_MESSAGE = 'Die Stunde konnte nicht geladen werden.';
export const RELOADED_MESSAGE = 'Die Stunde wurde neu geladen. Bitte die Korrektur mit den aktuellen Werten erneut eingeben.';

/** Rohwerte des Formulars (Text der Eingabefelder, Wettercode als Text, `""` = unbekannt). */
type FormValues = Record<CorrectionField, string> & { reason: string };

type FieldErrors = Partial<Record<CorrectionField | 'reason', string>>;

function numberControls(): Record<CorrectionField, FormControl<string>> {
  return Object.fromEntries(
    CORRECTION_FIELDS.map(spec => [spec.field, new FormControl('', { nonNullable: true })]),
  ) as Record<CorrectionField, FormControl<string>>;
}

/**
 * Korrektur einer Stunde (N03, US13-2 bis -11, US13-16 bis -18; 03 B3.4, B5.2): Formular mit den sechs
 * Feldern nach R16 und dem Pflichtfeld „Grund“, darunter die Historie mit „Zurücknehmen“.
 *
 * - Beim Öffnen: `GET /api/observations/:id` (Werte und `ETag`) und `GET …/corrections` (Historie).
 * - „Korrektur speichern“: Prüfung im Browser (Grenzen, Grund, mindestens eine Änderung), dann
 *   `PATCH` mit `If-Match` und nur den geänderten Feldern (`application/merge-patch+json`).
 * - 412 → „Der Wert wurde inzwischen geändert. Neu laden?“ mit „Neu laden“; 409 → Vorhersage;
 *   400 → Meldung am Feld (`aria-invalid`, `aria-describedby`), Rest oben; Fokus aufs erste Feld.
 * - „Zurücknehmen“ öffnet ein Feld „Grund“; `POST …/reversal` mit `If-Match`. 409
 *   `CORRECTION_NOT_REVERSIBLE` → verständliche Meldung, 412 wie oben.
 * - Nach Erfolg: Box „ERFOLG“ (Fokus darauf), neue Werte, neues `ETag`, neue Historie und `changed`, damit die
 *   Seite den Tag neu lädt.
 */
@Component({
  selector: 'app-hour-correction',
  imports: [
    ReactiveFormsModule, FormFieldComponent, NoticeComponent, LoadingComponent, ErrorComponent, SkeletonComponent,
    ChipComponent,
  ],
  templateUrl: './hour-correction.html',
  styleUrl: './hour-correction.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HourCorrectionComponent implements OnInit {
  private api = inject(AdminApiService);
  private document = inject(DOCUMENT);

  /** `observation.id` der Stunde (`hours[].id`). */
  readonly observationId = input.required<number>();
  /** „14:00 Uhr“ für Beschriftungen. */
  readonly label = input.required<string>();
  /** Nach einer gespeicherten Korrektur oder Rücknahme: die Seite lädt den Tag neu. */
  readonly changed = output<void>();

  readonly fields = CORRECTION_FIELDS.filter(spec => spec.field !== 'weatherCode');
  readonly weatherCodes = WEATHER_CODE_VALUES.map(code => ({ value: String(code), label: `${code} – ${describeWeather(code)}` }));
  readonly fieldLabel = CORRECTION_FIELD_LABEL;
  readonly reasonMax = REASON_MAX_LENGTH;
  readonly conflictMessage = CONFLICT_MESSAGE;
  readonly reloadedMessage = RELOADED_MESSAGE;
  readonly loadErrorMessage = HOUR_LOAD_ERROR_MESSAGE;
  readonly formatValue = formatCorrectionValue;
  readonly formatTime = formatDateTimeBerlin;

  readonly loadState = signal<'loading' | 'success' | 'error'>('loading');
  readonly loadErrorDetail = signal<string | null>(null);
  readonly observation = signal<ObservationResource | null>(null);
  readonly etag = signal<string | null>(null);
  readonly history = signal<CorrectionResource[]>([]);
  readonly feedback = signal<HourFeedback | null>(null);

  readonly form = new FormGroup({
    ...numberControls(),
    reason: new FormControl('', { nonNullable: true }),
  });
  readonly submitted = signal(false);
  readonly pending = signal(false);
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** Fehler im Browser, erst nach dem ersten Absenden und danach live. */
  readonly clientErrors = computed<FieldErrors>(() => (this.submitted() ? this.validate(this.formValue()) : {}));

  // ---------- Rücknahme ----------
  readonly reversingId = signal<number | null>(null);
  readonly reversalReason = new FormControl('', { nonNullable: true });
  readonly reversalSubmitted = signal(false);
  readonly reversalPending = signal(false);
  private readonly reversalValue = toSignal(this.reversalReason.valueChanges, { initialValue: '' });
  readonly reversalError = computed(() => (this.reversalSubmitted() ? reasonError(this.reversalValue()) : null));

  readonly reversible = computed(() => reversibleCorrectionIds(this.history(), this.observation()));

  private readonly feedbackBox = viewChild<ElementRef<HTMLElement>>('feedbackBox');
  private loadSubscription: Subscription | null = null;

  /** Erst hier laden: im Konstruktor ist das Input `observationId` noch nicht gesetzt. */
  ngOnInit(): void {
    this.load();
  }

  /** IDs der Felder, eindeutig je Stunde. */
  fieldId(field: CorrectionField | 'reason'): string {
    return `corr-${this.observationId()}-${field}`;
  }

  fieldError(field: CorrectionField | 'reason'): string | null {
    return this.clientErrors()[field] ?? null;
  }

  /** Lädt Stunde (mit `ETag`) und Historie; setzt das Formular auf die aktuellen Werte. */
  load(after?: () => void): void {
    this.loadSubscription?.unsubscribe();
    this.loadState.set('loading');
    const id = this.observationId();
    this.loadSubscription = forkJoin({
      current: this.api.getObservation(id),
      history: this.api.getCorrectionHistory(id),
    }).subscribe({
      next: ({ current, history }) => {
        this.apply(current);
        this.history.set(history.items);
        this.loadState.set('success');
        after?.();
      },
      error: (error: unknown) => {
        this.loadErrorDetail.set(apiErrorOf(error).message);
        this.loadState.set('error');
      },
    });
  }

  /** „Neu laden“ nach 412: frische Werte und Version, Eingaben werden verworfen. */
  reload(): void {
    this.feedback.set(null);
    this.load(() => this.showFeedback({ type: 'reloaded' }));
  }

  submit(): void {
    if (this.pending()) return;
    this.submitted.set(true);
    this.feedback.set(null);
    for (const control of Object.values(this.form.controls)) control.updateValueAndValidity();

    const values = this.form.getRawValue();
    const errors = this.validate(values);
    const firstInvalid = this.firstErrorField(errors);
    if (firstInvalid) {
      this.focus(this.fieldId(firstInvalid));
      return;
    }
    const observation = this.observation();
    if (!observation) return;
    const patch = this.buildPatch(observation, values);
    if (!patch) {
      this.showFeedback({ type: 'error', text: NO_CHANGE_MESSAGE });
      return;
    }
    const etag = this.etag();
    if (!etag) {
      this.showFeedback({ type: 'error', text: MISSING_ETAG_MESSAGE });
      return;
    }

    this.pending.set(true);
    this.api.patchObservation(observation.id, patch, etag).pipe(finalize(() => this.pending.set(false))).subscribe({
      next: result => {
        const text = `Korrektur gespeichert: ${this.changeText(observation, result.observation, patch)}.`;
        this.afterWrite(result, { type: 'success', text });
      },
      error: (error: unknown) => this.showPatchError(error),
    });
  }

  // ---------- Rücknahme ----------

  startReversal(correctionId: number): void {
    this.reversingId.set(correctionId);
    this.reversalReason.reset('');
    this.reversalSubmitted.set(false);
    this.focus(this.reversalFieldId(correctionId));
  }

  cancelReversal(): void {
    const id = this.reversingId();
    this.reversingId.set(null);
    if (id !== null) this.focus(this.revertButtonId(id));
  }

  reversalFieldId(correctionId: number): string {
    return `corr-${this.observationId()}-reversal-${correctionId}`;
  }

  revertButtonId(correctionId: number): string {
    return `corr-${this.observationId()}-revert-${correctionId}`;
  }

  submitReversal(): void {
    const correctionId = this.reversingId();
    const observation = this.observation();
    if (correctionId === null || !observation || this.reversalPending()) return;
    this.reversalSubmitted.set(true);
    this.feedback.set(null);
    this.reversalReason.updateValueAndValidity();
    if (reasonError(this.reversalReason.value)) {
      this.focus(this.reversalFieldId(correctionId));
      return;
    }
    const etag = this.etag();
    if (!etag) {
      this.showFeedback({ type: 'error', text: MISSING_ETAG_MESSAGE });
      return;
    }
    const entry = this.history().find(item => item.id === correctionId);
    this.reversalPending.set(true);
    this.api.reverseCorrection(observation.id, correctionId, this.reversalReason.value.trim(), etag)
      .pipe(finalize(() => this.reversalPending.set(false)))
      .subscribe({
        next: result => {
          const field = entry?.field;
          const text = field
            ? `Korrektur #${correctionId} zurückgenommen: ${CORRECTION_FIELD_LABEL[field]} wieder ${formatCorrectionValue(field, result.observation[field])}.`
            : `Korrektur #${correctionId} zurückgenommen.`;
          this.reversingId.set(null);
          this.afterWrite(result, { type: 'success', text });
        },
        error: (error: unknown) => this.showReversalError(error),
      });
  }

  // ---------- intern ----------

  private validate(values: FormValues): FieldErrors {
    const errors: FieldErrors = {};
    for (const spec of CORRECTION_FIELDS) {
      if (spec.field === 'weatherCode') continue;
      const parsed = parseCorrectionValue(spec.field, values[spec.field]);
      if (parsed.error) errors[spec.field] = parsed.error;
    }
    const reason = reasonError(values.reason);
    if (reason) errors.reason = reason;
    return errors;
  }

  private firstErrorField(errors: FieldErrors): CorrectionField | 'reason' | null {
    const order: (CorrectionField | 'reason')[] = [...CORRECTION_FIELDS.map(spec => spec.field), 'reason'];
    return order.find(field => errors[field]) ?? null;
  }

  /** Nur geänderte Felder (Merge Patch); ohne Änderung `null`. */
  private buildPatch(observation: ObservationResource, values: FormValues): ObservationPatch | null {
    const patch: ObservationPatch = { reason: values.reason.trim() };
    let changed = false;
    for (const spec of CORRECTION_FIELDS) {
      const raw = values[spec.field];
      const value = spec.field === 'weatherCode'
        ? (raw === '' ? null : Number(raw))
        : parseCorrectionValue(spec.field, raw).value;
      if (!sameValue(value, observation[spec.field])) {
        patch[spec.field] = value;
        changed = true;
      }
    }
    return changed ? patch : null;
  }

  /** „Temperatur 19,6 °C → 9,6 °C“ für die Erfolgsbox. */
  private changeText(before: ObservationResource, after: ObservationResource, patch: ObservationPatch): string {
    return CORRECTION_FIELDS
      .filter(spec => spec.field in patch)
      .map(spec => `${spec.label} ${formatCorrectionValue(spec.field, before[spec.field])} → ${formatCorrectionValue(spec.field, after[spec.field])}`)
      .join(', ');
  }

  /** Stunde und Version aus der Antwort übernehmen, Formular zurücksetzen. */
  private apply(current: VersionedObservation): void {
    this.observation.set(current.observation);
    this.etag.set(current.etag);
    this.submitted.set(false);
    const values = Object.fromEntries(CORRECTION_FIELDS.map(spec => [
      spec.field,
      spec.field === 'weatherCode'
        ? (current.observation.weatherCode === null ? '' : String(current.observation.weatherCode))
        : inputValue(current.observation[spec.field]),
    ])) as Record<CorrectionField, string>;
    this.form.reset({ ...values, reason: '' });
  }

  /** Nach PATCH oder Rücknahme: neue Werte und `ETag` sofort, Historie neu, Seite informieren. */
  private afterWrite(result: VersionedObservation, feedback: HourFeedback): void {
    this.apply(result);
    this.showFeedback(feedback);
    this.changed.emit();
    this.api.getCorrectionHistory(result.observation.id).subscribe({
      next: history => this.history.set(history.items),
      error: () => {},
    });
  }

  private showPatchError(error: unknown): void {
    const apiError = apiErrorOf(error);
    if (apiError.statusCode === 412) {
      this.showFeedback({ type: 'conflict' });
      return;
    }
    if (apiError.statusCode === 409) {
      this.showFeedback({ type: 'error', text: apiError.code === 'OBSERVATION_IS_PREDICTION' ? PREDICTION_MESSAGE : apiError.message });
      return;
    }
    if (error instanceof HttpErrorResponse && apiError.statusCode === 400) {
      const unmatched = applyServerErrors(error, this.form);
      const matchedAny = apiError.errors.length > unmatched.length;
      if (unmatched.length > 0 || !matchedAny) {
        this.showFeedback({ type: 'error', text: unmatched.map(e => e.message).join(' ') || apiError.message }, !matchedAny);
      }
      const order: (CorrectionField | 'reason')[] = [...CORRECTION_FIELDS.map(spec => spec.field), 'reason'];
      const first = order.find(field => this.form.controls[field].invalid);
      if (first) this.focus(this.fieldId(first));
      return;
    }
    this.showFeedback({ type: 'error', text: apiError.statusCode === 428 ? MISSING_ETAG_MESSAGE : apiError.message });
  }

  private showReversalError(error: unknown): void {
    const apiError = apiErrorOf(error);
    if (apiError.statusCode === 412) {
      this.showFeedback({ type: 'conflict' });
      return;
    }
    if (apiError.code === 'CORRECTION_NOT_REVERSIBLE') {
      this.reversingId.set(null);
      this.showFeedback({ type: 'error', text: NOT_REVERSIBLE_MESSAGE });
      // Die Historie hat sich offenbar geändert: neu laden, damit der Button verschwindet.
      this.api.getCorrectionHistory(this.observationId()).subscribe({ next: h => this.history.set(h.items), error: () => {} });
      return;
    }
    const reasonMessage = apiError.statusCode === 400 ? apiError.errors.find(e => e.field === 'reason')?.message : undefined;
    if (reasonMessage) {
      this.reversalReason.setErrors({ server: reasonMessage });
      this.reversalReason.markAsTouched();
      const id = this.reversingId();
      if (id !== null) this.focus(this.reversalFieldId(id));
      return;
    }
    this.showFeedback({ type: 'error', text: apiError.statusCode === 428 ? MISSING_ETAG_MESSAGE : apiError.message });
  }

  /** Rückmeldung zeigen und den Fokus darauf setzen (nach dem Rendern). */
  private showFeedback(feedback: HourFeedback, focus = true): void {
    this.feedback.set(feedback);
    if (focus) setTimeout(() => this.feedbackBox()?.nativeElement.focus());
  }

  private focus(id: string): void {
    // Nach dem Rendern, damit aria-invalid/aria-describedby schon gesetzt sind.
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}
