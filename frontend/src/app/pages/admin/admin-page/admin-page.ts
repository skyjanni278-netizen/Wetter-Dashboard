import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import type { ApiError, UserResource } from '../../../models/api';
import type { LoadResult, LoadState } from '../../../models/load-state';
import { apiErrorOf } from '../../../interceptors/api-error.interceptor';
import { CardComponent } from '../../../components/card/card';
import { LoadingComponent } from '../../../components/state/loading';
import { ErrorComponent } from '../../../components/state/error';
import { SkeletonComponent } from '../../../components/skeleton/skeleton';

export const ME_ERROR_MESSAGE = 'Die Anmeldedaten konnten nicht geladen werden.';

interface MeResult extends LoadResult<UserResource> {
  apiError: ApiError | null;
}

/**
 * Admin-Startseite `/admin` (Schritt 10: nur „Angemeldet als <username>“).
 * Daten aus `GET /api/auth/me` (US09-8). Fehler: Fehlerbox mit „Erneut versuchen“; bei 401 meldet der
 * `authInterceptor` ab und leitet zur Anmeldung weiter. Ab Schritt 11 wird daraus die Statusseite.
 */
@Component({
  selector: 'app-admin-page',
  imports: [CardComponent, LoadingComponent, ErrorComponent, SkeletonComponent],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.css',
})
export class AdminPageComponent {
  private auth = inject(AuthService);

  readonly me = signal<UserResource | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly apiError = signal<ApiError | null>(null);

  private reloadCount = signal(0);

  constructor() {
    toObservable(this.reloadCount).pipe(
      switchMap(() => this.load()),
      takeUntilDestroyed(),
    ).subscribe(result => {
      this.state.set(result.state);
      this.error.set(result.message);
      this.apiError.set(result.apiError);
      if (result.state !== 'loading') this.me.set(result.data);
    });
  }

  retry(): void {
    this.reloadCount.update(n => n + 1);
  }

  private load(): Observable<MeResult> {
    return this.auth.me().pipe(
      map((me): MeResult => ({ state: 'success', data: me, message: null, apiError: null })),
      catchError(err => of<MeResult>({ state: 'error', data: null, message: ME_ERROR_MESSAGE, apiError: apiErrorOf(err) })),
      startWith<MeResult>({ state: 'loading', data: null, message: null, apiError: null }),
    );
  }
}
