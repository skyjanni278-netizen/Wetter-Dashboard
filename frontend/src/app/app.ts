import { Component, DOCUMENT, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';

/** Tagesansicht: `/` (heute) und `/tag/:date` (V08). */
function isDayView(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/' || path.startsWith('/tag/');
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);
  private document = inject(DOCUMENT);

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
