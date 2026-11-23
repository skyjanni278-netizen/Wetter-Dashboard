import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import type { Status } from '../models/api';
import { berlinToday } from '../utils/berlin-date';
import { WeatherService } from './weather.service';

/** Ladezustand von `/api/status`: `idle` = noch nicht angefordert (z. B. in Specs ohne App). */
export type DataStatusState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Datenstand für die ganze App (N01, N04): **ein** `GET /api/status` beim App-Start (`App` ruft `load()`),
 * geteilt von Seitenkopf, Hinweisbox, Footer und der Statusseite.
 *
 * `today` ist der Berliner Tag laut Server (`status.today`, auch mit `FAKE_NOW`). Bis die Antwort da ist
 * oder wenn sie fehlschlägt, gilt die Browser-Uhr (`berlinToday()`, 03 B4.8). Seiten, deren Request vom
 * Heute abhängt (Monat: `to = min(Monatsende, heute)`, Tag: „Zukunft?“), warten, solange `waiting()` gilt,
 * damit kein Request mit dem Browser-Datum hinausgeht (sonst z. B. 400 `DATE_IN_FUTURE`). Ohne `load()`
 * (Specs einzelner Seiten) bleibt der Zustand `idle`: niemand wartet, `today` ist die Browser-Uhr.
 */
@Injectable({ providedIn: 'root' })
export class DataStatusService {
  private weather = inject(WeatherService);
  private subscription: Subscription | null = null;
  private readonly results = new ReplaySubject<Status | null>(1);

  readonly state = signal<DataStatusState>('idle');
  readonly status = signal<Status | null>(null);

  /** Jede Antwort sofort (synchron) als Status bzw. `null` bei einem Fehler; für den Footer. */
  readonly results$: Observable<Status | null> = this.results.asObservable();

  /** Berliner Heute laut Server, bis dahin bzw. ohne Antwort die Browser-Uhr. */
  readonly today = computed(() => this.status()?.today ?? berlinToday());

  /** Der erste Request läuft noch: Seiten mit heute-abhängigen Requests warten. */
  readonly waiting = computed(() => this.state() === 'loading' && this.status() === null);

  /** Lädt `/api/status` (beim App-Start); tut nichts, solange ein Request läuft oder Daten da sind. */
  load(): void {
    if (this.state() === 'loading' || this.state() === 'success') return;
    this.refresh();
  }

  /**
   * Lädt neu (Statusseite, „Erneut versuchen“). Der bisherige Stand bleibt im Signal, bis die Antwort da ist,
   * auch bei einem Fehler; dann ist `state` `error` (die Statusseite zeigt ihn dann nicht mehr an).
   */
  refresh(): void {
    this.subscription?.unsubscribe();
    this.state.set('loading');
    this.subscription = this.weather.getStatus().subscribe({
      next: status => {
        this.status.set(status);
        this.state.set('success');
        this.results.next(status);
      },
      error: () => {
        this.state.set('error');
        this.results.next(null);
      },
    });
  }
}
