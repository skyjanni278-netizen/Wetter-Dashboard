import { Component, DOCUMENT, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import { applyServerErrors } from '../../../utils/apply-server-errors';
import { ADMIN_HOME, safeReturnUrl } from '../../../utils/return-url';
import { CardComponent } from '../../../components/card/card';
import { FormFieldComponent } from '../../../components/form-field/form-field';
import { NoticeComponent } from '../../../components/notice/notice';

export const USERNAME_REQUIRED_MESSAGE = 'Bitte den Benutzernamen eingeben.';
export const PASSWORD_REQUIRED_MESSAGE = 'Bitte das Passwort eingeben.';
export const INVALID_CREDENTIALS_MESSAGE = 'Benutzername oder Passwort ist falsch.';
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Zu viele Anmeldeversuche. Bitte eine Minute warten und dann erneut versuchen.';
export const UNREACHABLE_LOGIN_MESSAGE = 'Server nicht erreichbar. Bitte später erneut versuchen.';
export const LOGIN_FAILED_MESSAGE = 'Die Anmeldung ist fehlgeschlagen.';

/** Pflichtfeld; beim Benutzernamen zählen nur Leerzeichen als leer (der Server trimmt). */
function requiredText(trim: boolean) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value ?? '';
    return (trim ? value.trim() : value) === '' ? { required: true } : null;
  };
}

type LoginField = 'username' | 'password';

const REQUIRED_MESSAGE: Record<LoginField, string> = {
  username: USERNAME_REQUIRED_MESSAGE,
  password: PASSWORD_REQUIRED_MESSAGE,
};

/**
 * Anmeldung `/admin/anmeldung` (US09, E3.7.3, B5.2).
 *
 * - Sichtbare Labels, `autocomplete="username"` / `current-password`.
 * - Client-Prüfung beim Absenden: leeres Feld → Meldung am Feld (`aria-invalid`, `aria-describedby`
 *   über `app-form-field`), Fokus auf das erste fehlerhafte Feld, kein Request.
 * - Serverfehler: 400 mit `errors[].field` → Meldung am Feld (`applyServerErrors`); allgemeine Fehler
 *   (401 `INVALID_CREDENTIALS`, 429, Server nicht erreichbar, Rest) oben im Formular (`role="alert"`).
 * - Während des Sendens ist der Button gesperrt (`aria-disabled`, `aria-busy`, Text „Wird angemeldet …“).
 * - Erfolg → `returnUrl` (nur interne Pfade, `safeReturnUrl`), sonst `/admin`.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, CardComponent, FormFieldComponent, NoticeComponent],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);

  /** Rückkehrziel aus `?returnUrl=` (Guard, Interceptor); per `withComponentInputBinding()`. */
  readonly returnUrl = input<string | undefined>(undefined);

  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [requiredText(true)] }),
    password: new FormControl('', { nonNullable: true, validators: [requiredText(false)] }),
  });

  /** Absenden wurde versucht: ab jetzt zeigen leere Felder ihre Meldung. */
  readonly submitted = signal(false);
  readonly pending = signal(false);
  /** Allgemeiner Fehler oben im Formular. */
  readonly generalError = signal<string | null>(null);

  /** Client-Fehler eines Felds (nur nach dem ersten Absenden). */
  fieldError(name: LoginField): string | null {
    return this.submitted() && this.form.controls[name].hasError('required') ? REQUIRED_MESSAGE[name] : null;
  }

  submit(): void {
    if (this.pending()) return;
    this.submitted.set(true);
    this.generalError.set(null);
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.pending.set(true);
    this.auth.login(username, password).pipe(finalize(() => this.pending.set(false))).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? ADMIN_HOME),
      error: (error: unknown) => this.showError(error),
    });
  }

  private showError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.generalError.set(LOGIN_FAILED_MESSAGE); // z. B. Antwort ohne Token
      return;
    }
    const apiError = apiErrorOf(error);
    if (error.status === 400) {
      const unmatched = applyServerErrors(error, this.form);
      const matchedAny = apiError.errors.length > unmatched.length;
      if (matchedAny && unmatched.length === 0) {
        this.focusFirstInvalid();
        return;
      }
      this.generalError.set(unmatched.map(e => e.message).join(' ') || apiError.message);
      if (matchedAny) this.focusFirstInvalid();
      return;
    }
    this.generalError.set(generalMessage(apiError.statusCode, apiError.code));
  }

  private focusFirstInvalid(): void {
    const first = (['username', 'password'] as const).find(name => this.form.controls[name].invalid);
    if (!first) return;
    // Nach dem Rendern, damit aria-invalid/aria-describedby schon gesetzt sind.
    setTimeout(() => this.document.getElementById(`login-${first}`)?.focus());
  }
}

/** Allgemeine Meldung je Status (B5.2): fester Text statt Server-Text, gleich für Name und Passwort (US09-3). */
export function generalMessage(status: number, code: string): string {
  if (status === 401) return INVALID_CREDENTIALS_MESSAGE;
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (code === 'SERVICE_UNAVAILABLE') return UNREACHABLE_LOGIN_MESSAGE;
  return LOGIN_FAILED_MESSAGE;
}
