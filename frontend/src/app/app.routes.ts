import { Routes, UrlMatchResult, UrlMatcher, UrlSegment } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { berlinToday } from './utils/berlin-date';
import {
  adminViewTitle, correctionDayTitle, dayViewTitle, importDetailTitle, monthViewTitle, yearViewTitle,
} from './utils/page-title';

const todayPage = () => import('./pages/today-page/today-page').then(m => m.TodayPageComponent);
const monthlyPage = () => import('./pages/monthly-page/monthly-page').then(m => m.MonthlyPageComponent);
const yearlyPage = () => import('./pages/yearly-page/yearly-page').then(m => m.YearlyPageComponent);

/**
 * Ein Routeneintrag für `prefix` ohne Parameter **und** `prefix/:a/:b…` (14b, WCAG 2.4.3): Weil beide
 * Formen dieselbe Route sind, verwendet der Router die Seite beim Wechsel `/` ↔ `/tag/:date`,
 * `/monat` → `/monat/2026/10` usw. weiter (Standard-RouteReuseStrategy vergleicht `routeConfig`).
 * Die Seite wird nicht neu erzeugt, der Fokus bleibt auf dem Bedienelement (‹ ›, „Heute“, Selects).
 * `base` = Segmente der Form ohne Parameter (`[]` = Startseite), `prefix` = erstes Segment der Form
 * mit Parametern. Fehlende Parameter setzt die Input-Bindung auf `undefined`.
 */
export function optionalParamsMatcher(base: readonly string[], prefix: string, params: readonly string[]): UrlMatcher {
  return (segments: UrlSegment[]): UrlMatchResult | null => {
    const paths = segments.map(s => s.path);
    if (paths.length === base.length && paths.every((p, i) => p === base[i])) return { consumed: segments };
    if (paths[0] !== prefix || paths.length !== params.length + 1) return null;
    const posParams = Object.fromEntries(params.map((name, i) => [name, segments[i + 1]]));
    return { consumed: segments, posParams };
  };
}

// Die Auswahl steht in der URL (V08, F11); die Parameter gehen per withComponentInputBinding()
// als input() in die Seiten. Ohne Parameter zeigen die Seiten heute bzw. den aktuellen Berliner
// Monat und das aktuelle Jahr (keine Umleitung). Der Titel kommt aus denselben Funktionen wie in
// den Seiten, damit TitleStrategy und Seite nie unterschiedliche Titel setzen.
// Je Seite genau ein Eintrag (optionalParamsMatcher), damit ein Parameterwechsel die Seite behält.
export const routes: Routes = [
  {
    // `` (heute) und `tag/:date`
    matcher: optionalParamsMatcher([], 'tag', ['date']),
    title: route => dayViewTitle(route.paramMap.get('date') ?? berlinToday()),
    loadComponent: todayPage,
  },
  {
    // `monat` und `monat/:year/:month`
    matcher: optionalParamsMatcher(['monat'], 'monat', ['year', 'month']),
    title: route => {
      if (route.paramMap.has('year')) return monthViewTitle(route.paramMap.get('year'), route.paramMap.get('month'));
      const t = berlinToday();
      return monthViewTitle(t.slice(0, 4), t.slice(5, 7));
    },
    loadComponent: monthlyPage,
  },
  {
    // `jahr` und `jahr/:year`
    matcher: optionalParamsMatcher(['jahr'], 'jahr', ['year']),
    title: route => yearViewTitle(route.paramMap.get('year') ?? berlinToday().slice(0, 4)),
    loadComponent: yearlyPage,
  },
  {
    path: 'statistiken',
    title: 'Rekorde',
    loadComponent: () => import('./pages/stats-page/stats-page').then(m => m.StatsPageComponent),
  },
  // Datenstand für Gäste (N04, US17-4): erreichbar über den Footer-Link „Datenstand“ (bis 14b „Status“).
  {
    path: 'status',
    title: 'Datenstand',
    loadComponent: () => import('./pages/status-page/status-page').then(m => m.DataStatusPageComponent),
  },
  // Anmeldung (US09): nur über die URL erreichbar, Gäste sehen keinen Link darauf (E3.7.1).
  // Steht vor `admin`, damit der Guard die Login-Seite nicht sperrt.
  {
    path: 'admin/anmeldung',
    title: 'Anmeldung',
    loadComponent: () => import('./pages/admin/login-page/login-page').then(m => m.LoginPageComponent),
  },
  // Admin-Bereich: nur mit gültigem Token, sonst Umleitung auf die Anmeldung mit returnUrl (adminGuard).
  // canMatch läuft bei jeder Navigation, also auch beim Wechsel zwischen den Kindseiten (abgelaufenes
  // Token + Klick auf „Importe“ → Anmeldung mit returnUrl=/admin/importe). Rahmen und Seiten laden lazy.
  {
    path: 'admin',
    canMatch: [adminGuard],
    loadComponent: () => import('./pages/admin/admin-layout/admin-layout').then(m => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        title: adminViewTitle('Status'),
        loadComponent: () => import('./pages/admin/status-page/status-page').then(m => m.StatusPageComponent),
      },
      {
        path: 'importe',
        title: adminViewTitle('Importe'),
        loadComponent: () => import('./pages/admin/imports-page/imports-page').then(m => m.ImportsPageComponent),
      },
      {
        path: 'importe/:id',
        title: route => importDetailTitle(route.paramMap.get('id')),
        loadComponent: () => import('./pages/admin/import-detail-page/import-detail-page').then(m => m.ImportDetailPageComponent),
      },
      {
        path: 'luecken',
        title: adminViewTitle('Lücken'),
        loadComponent: () => import('./pages/admin/gaps-page/gaps-page').then(m => m.GapsPageComponent),
      },
      // Korrekturen (N03): Übersicht (US13-14) und Stunden eines Tages mit Formular und Historie (US13-2, -16)
      {
        path: 'korrektur',
        title: adminViewTitle('Korrekturen'),
        loadComponent: () => import('./pages/admin/corrections-page/corrections-page').then(m => m.CorrectionsPageComponent),
      },
      {
        path: 'korrektur/:date',
        title: route => correctionDayTitle(route.paramMap.get('date')),
        loadComponent: () => import('./pages/admin/correction-page/correction-page').then(m => m.CorrectionPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
