import { Component, DOCUMENT, Injector, afterNextRender, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot, NavigationEnd, Route, Router, RouterOutlet, RouterLink, RouterLinkActive,
} from '@angular/router';
import { Observable, catchError, combineLatest, distinctUntilChanged, filter, map, of, startWith, switchMap } from 'rxjs';
import { SkeletonComponent } from './components/skeleton/skeleton';
import { AuthService } from './services/auth.service';
import { DataStatusService } from './services/data-status.service';
import { WeatherService } from './services/weather.service';
import { formatDateDe } from './utils/berlin-date';
import { footerUpdateText } from './utils/data-status';

/** Ort, wenn die neue API (noch) nicht antwortet: bisheriger statischer Text. */
const FALLBACK_LOCATION_NAME = 'Heubach';

/** Footer-Block „Standort“: Ort und Datenzeitraum aus `/api/status` (Nest). */
export type FooterDataState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'success'; locationName: string; dataFrom: string; dataTo: string };

/**
 * Status (aus dem `DataStatusService`, ein Request je App-Start) und Standort zu einem Zustand für den Footer.
 * Der Standort wird nur bei einer neuen `locationId` geladen. Fehler oder fehlender Zeitraum ergeben `error`:
 * Der Footer zeigt dann nur den statischen Text.
 */
export function footerData(dataStatus: DataStatusService, weather: WeatherService): Observable<FooterDataState> {
  const location$ = dataStatus.results$.pipe(
    map(status => status?.locationId ?? null),
    distinctUntilChanged(),
    switchMap(id => (id === null ? of(null) : weather.getLocation(id).pipe(catchError(() => of(null))))),
  );
  return combineLatest([dataStatus.results$, location$]).pipe(
    map(([status, location]): FooterDataState =>
      status && location && status.dataFrom && status.dataTo
        ? { state: 'success', locationName: location.name, dataFrom: status.dataFrom, dataTo: status.dataTo }
        : { state: 'error' },
    ),
    startWith<FooterDataState>({ state: 'loading' }),
  );
}

/**
 * Seite einer Navigation: Routeneintrag der tiefsten aktiven Route. `/` und `/tag/:date`, `/monat` und
 * `/monat/2026/10` usw. sind derselbe Eintrag (app.routes.ts), ebenso Wechsel nur der Query.
 */
export function pageOf(root: ActivatedRouteSnapshot): Route | null {
  let route = root;
  while (route.firstChild) route = route.firstChild;
  return route.routeConfig;
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
  private auth = inject(AuthService);
  private dataStatus = inject(DataStatusService);
  private injector = inject(Injector);
  /** Seite der letzten Navigation (`undefined` vor der ersten), für das Fokusmanagement. */
  private lastPage: Route | null | undefined = undefined;

  /** Header: „Admin“ und „Abmelden“ nur nach der Anmeldung (E3.7.1); Gäste sehen keinen Hinweis. */
  readonly loggedIn = this.auth.isLoggedIn;

  /** Footer „Standort“; `/api/status` lädt einmal je App-Start (DataStatusService), kein Neuladen bei Navigation. */
  readonly footer = toSignal(footerData(this.dataStatus, this.weather), { requireSync: true });

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

  /** Footer „Datenstand“ (E3.7.9, N01): „Zuletzt aktualisiert: 19.11.2026, 14:05 Uhr“; `null` ohne Status. */
  readonly footerUpdate = computed(() => {
    const status = this.dataStatus.status();
    return status ? footerUpdateText(status) : null;
  });
  readonly footerUpdateLoading = computed(() => this.dataStatus.waiting());

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

  constructor() {
    // Ein Request je App-Start; „heute“ laut Server für Seitenkopf, Monat und Tag (03 B4.8).
    this.dataStatus.load();

    // Fokusmanagement beim Routenwechsel (14b, WCAG 2.4.3): Seitenwechsel → Fokus auf die h1 der neuen
    // Seite (Screenreader lesen die Überschrift, Tab geht ab dort weiter). Wechsel nur der Parameter
    // oder der Query derselben Seite → Fokus bleibt auf dem Bedienelement; nur wenn es dabei
    // verschwunden ist (Fokus auf body), springt er auf die h1. Die erste Navigation ändert nichts.
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => {
      const page = pageOf(this.router.routerState.snapshot.root);
      const previous = this.lastPage;
      this.lastPage = page;
      if (previous === undefined) return;
      this.focusPageHeading(previous === page ? 'if-lost' : 'always');
    });
  }

  /**
   * Nach dem nächsten Rendern: Fokus auf die erste h1 in `<main>` (bekommt `tabindex="-1"`, ohne
   * sichtbaren Ring, styles.css), ohne h1 auf `<main>`. `if-lost`: nur, wenn der Fokus auf body liegt.
   */
  focusPageHeading(mode: 'always' | 'if-lost' = 'always'): void {
    afterNextRender(() => {
      const active = this.document.activeElement;
      if (mode === 'if-lost' && active && active !== this.document.body) return;
      const main = this.document.getElementById('main');
      const heading = main?.querySelector<HTMLElement>('h1') ?? null;
      if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      (heading ?? main)?.focus();
    }, { injector: this.injector });
  }

  /**
   * „Abmelden“ (US09-9): Token verwerfen (`sessionStorage`), dann zur Startseite. Der Button verschwindet;
   * der Fokus geht auf die h1 der Startseite, auch wenn sie schon offen war (keine Navigation, 14b).
   */
  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/').then(() => this.focusPageHeading());
  }

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
