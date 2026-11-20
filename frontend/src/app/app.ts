import { Component, DOCUMENT, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, catchError, filter, map, of, startWith, switchMap } from 'rxjs';
import { SkeletonComponent } from './components/skeleton/skeleton';
import { WeatherService } from './services/weather.service';
import { formatDateDe } from './utils/berlin-date';

/** Ort, wenn die neue API (noch) nicht antwortet: bisheriger statischer Text. */
const FALLBACK_LOCATION_NAME = 'Heubach';

/** Footer-Block „Datenstand“: Ort und Datenzeitraum aus `/api/status` (Nest). */
export type FooterDataState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'success'; locationName: string; dataFrom: string; dataTo: string };

/**
 * Status und Standort der neuen API zu einem Zustand für den Footer.
 * Fehler oder fehlender Zeitraum ergeben `error`: Der Footer zeigt dann nur den statischen Text.
 */
export function footerData(weather: WeatherService): Observable<FooterDataState> {
  return weather.getStatus().pipe(
    switchMap(status =>
      weather.getLocation(status.locationId).pipe(
        map((location): FooterDataState =>
          status.dataFrom && status.dataTo
            ? { state: 'success', locationName: location.name, dataFrom: status.dataFrom, dataTo: status.dataTo }
            : { state: 'error' },
        ),
      ),
    ),
    catchError(() => of<FooterDataState>({ state: 'error' })),
    startWith<FooterDataState>({ state: 'loading' }),
  );
}

/** Tagesansicht: `/` (heute) und `/tag/:date` (V08). */
function isDayView(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/' || path.startsWith('/tag/');
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SkeletonComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private weather = inject(WeatherService);

  /** Footer „Datenstand“; ein Request je App-Start, kein Neuladen bei Navigation. */
  readonly footer = toSignal(footerData(this.weather), { requireSync: true });

  /** Ortsname im Footer: aus `/api/locations/:id`, sonst der statische Text. */
  readonly footerLocationName = computed(() => {
    const footer = this.footer();
    return footer.state === 'success' ? footer.locationName : FALLBACK_LOCATION_NAME;
  });

  /** Datenzeitraum im deutschen Datumsformat oder `null` (Laden, Fehler). */
  readonly footerRange = computed(() => {
    const footer = this.footer();
    if (footer.state !== 'success') return null;
    return {
      from: footer.dataFrom,
      to: footer.dataTo,
      fromLabel: formatDateDe(footer.dataFrom),
      toLabel: formatDateDe(footer.dataTo),
    };
  });

  /**
   * Nav „Heute“ ist in der ganzen Tagesansicht aktiv. routerLinkActive kann das nicht abbilden,
   * weil `/tag/...` keine Unterroute von `/` ist.
   */
  readonly dayViewActive = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => isDayView(e.urlAfterRedirects)),
    ),
    { initialValue: false },
  );

  /**
   * Skip-Link: `href="#main"` würde wegen `<base href="/">` nach `/#main` navigieren.
   * Deshalb wird der Inhalt direkt fokussiert; die Route bleibt unverändert.
   */
  skipToMain(event: Event): void {
    const main = this.document.getElementById('main');
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView?.();
  }
}
