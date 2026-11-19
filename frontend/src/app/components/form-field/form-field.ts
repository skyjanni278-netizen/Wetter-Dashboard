import {
  ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, afterRenderEffect, computed, inject, input,
} from '@angular/core';

/**
 * Formularfeld (E3.7.3): sichtbares Label über dem Feld, Feld per Content Projection,
 * Hilfetext und Fehlermeldung darunter.
 *
 * Das projizierte Bedienelement trägt die `id` aus `fieldId`. Die Komponente setzt daran
 * `aria-describedby` (Hilfetext und Fehler) und bei einem Fehler `aria-invalid="true"`.
 * Die Fehlermeldung hat `role="alert"` und das Symbol „!“ (`aria-hidden`).
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
    '[class.form-field-invalid]': '!!error()',
  },
})
export class FormFieldComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly label = input.required<string>();
  /** `id` des projizierten Bedienelements (für `<label for>` und die ARIA-Verknüpfung). */
  readonly fieldId = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);

  readonly hintId = computed(() => `${this.fieldId()}-hint`);
  readonly errorId = computed(() => `${this.fieldId()}-error`);
  readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId() : null, this.error() ? this.errorId() : null].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  constructor() {
    afterRenderEffect({
      write: () => {
        const control = this.control();
        if (!control) return;
        const describedBy = this.describedBy();
        if (describedBy) control.setAttribute('aria-describedby', describedBy);
        else control.removeAttribute('aria-describedby');
        if (this.error()) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      },
    });
  }

  private control(): HTMLElement | null {
    const id = this.fieldId();
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')).find(el => el.id === id) ?? null;
  }
}
