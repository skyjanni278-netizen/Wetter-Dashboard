import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Rahmen des Admin-Bereichs (`/admin`, Schritt 11): Seitenbreite (`.page`), Unternavigation
 * „Status“, „Importe“, „Lücken“, „Korrekturen“ (seit 12a) und darunter die Kindseite. Der Header bleibt unverändert (Link
 * „Admin“, „Abmelden“). Die Route trägt den `adminGuard`; die Kindseiten laden lazy.
 *
 * „Status“ ist nur auf `/admin` aktiv (`exact`), „Importe“ auch auf `/admin/importe/:id`, „Korrekturen“ auch
 * auf `/admin/korrektur/:date`.
 * Der aktive Punkt trägt `aria-current="page"` und eine Linie unter dem Text (nicht nur Farbe).
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {}
