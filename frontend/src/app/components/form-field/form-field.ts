import {
  ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, afterRenderEffect, computed, inject, input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl } from '@angular/forms';
import { map, of, startWith, switchMap } from 'rxjs';
import { SERVER_ERROR_KEY } from '../../utils/apply-server-errors';

/** Meldung des Server-Fehlers (`{ server: message }`, gesetzt von `applyServerErrors`) oder `null`. */
function serverMessage(control: AbstractControl): string | null {
  const message: unknown = control.errors?.[SERVER_ERROR_KEY];
  return typeof message === 'string' && message ? message : null;
}

/**
 * Formularfeld (E3.7.3): sichtbares Label über dem Feld, Feld per Content Projection,
 * Hilfetext und Fehlermeldung darunter.
 *
 * Das projizierte Bedienelement trägt die `id` aus `fieldId`. Die Komponente setzt daran
 * `aria-describedby` (Hilfetext und Fehler) und bei einem Fehler `aria-invalid="true"`.
 * Die Fehlermeldung hat `role="alert"` und das Symbol „!“ (`aria-hidden`).
 *
 * Fehlerquellen: `error` (von der Seite) oder, wenn `control` gesetzt ist, ein Server-Fehler am
 * Control (`errors.server` aus einer 400-Antwort, B5.2; siehe `applyServerErrors`). `error` hat
 * Vorrang. Ändert der Nutzer den Wert, prüft Angular das Control neu und der Server-Fehler entfällt.
 *
 * Ohne View-Kapselung, weil die Feldstile (44 px, Rand, Fehlerrahmen) für projizierte
 * `<input>`/`<select>` gelten müssen; alle Selektoren beginnen mit `.form-field`.
 */
@Component({
  selector: 'app-form-field',
  templateUrl: './form-field.html',
  styleUrl: './form-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'form-field',
    '[class.form-field-invalid]': '!!shownError()',
  },
})
export class FormFieldComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly label = input.required<string>();
  /** `id` des projizierten Bedienelements (für `<label for>` und die ARIA-Verknüpfung). */
  readonly fieldId = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  /** Reactive-Forms-Control des Felds; dessen Fehler `server` wird angezeigt. */
  readonly control = input<AbstractControl | null>(null);

  /** Server-Fehler am Control; folgt jeder Status- und Wertänderung (`control.events`). */
  private readonly serverError = toSignal(
    toObservable(this.control).pipe(
      switchMap(control =>
        control ? control.events.pipe(startWith(null), map(() => serverMessage(control))) : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** Angezeigte Meldung: Fehler der Seite, sonst Server-Fehler. */
  readonly shownError = computed(() => this.error() || this.serverError());

  readonly hintId = computed(() => `${this.fieldId()}-hint`);
  readonly errorId = computed(() => `${this.fieldId()}-error`);
  readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId() : null, this.shownError() ? this.errorId() : null].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  constructor() {
    afterRenderEffect({
      write: () => {
        const control = this.controlElement();
        if (!control) return;
        const describedBy = this.describedBy();
        if (describedBy) control.setAttribute('aria-describedby', describedBy);
        else control.removeAttribute('aria-describedby');
        if (this.shownError()) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      },
    });
  }

  private controlElement(): HTMLElement | null {
    const id = this.fieldId();
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')).find(el => el.id === id) ?? null;
  }
}
