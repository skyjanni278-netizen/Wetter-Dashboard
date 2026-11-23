import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { berlinToday } from './utils/berlin-date';
import {
  adminViewTitle, correctionDayTitle, dayViewTitle, importDetailTitle, monthViewTitle, yearViewTitle,
} from './utils/page-title';

const todayPage = () => import('./pages/today-page/today-page').then(m => m.TodayPageComponent);
const monthlyPage = () => import('./pages/monthly-page/monthly-page').then(m => m.MonthlyPageComponent);
const yearlyPage = () => import('./pages/yearly-page/yearly-page').then(m => m.YearlyPageComponent);

// Die Auswahl steht in der URL (V08, F11); die Parameter gehen per withComponentInputBinding()
// als input() in die Seiten. Ohne Parameter zeigen die Seiten heute bzw. den aktuellen Berliner
// Monat und das aktuelle Jahr (keine Umleitung). Der Titel kommt aus denselben Funktionen wie in
// den Seiten, damit TitleStrategy und Seite nie unterschiedliche Titel setzen.
export const routes: Routes = [
  {
    path: '',
    title: () => dayViewTitle(berlinToday()),
    loadComponent: todayPage,
  },
  {
    path: 'tag/:date',
    title: route => dayViewTitle(route.paramMap.get('date')),
    loadComponent: todayPage,
  },
  {
    path: 'monat',
    title: () => { const t = berlinToday(); return monthViewTitle(t.slice(0, 4), t.slice(5, 7)); },
    loadComponent: monthlyPage,
  },
  {
    path: 'monat/:year/:month',
    title: route => monthViewTitle(route.paramMap.get('year'), route.paramMap.get('month')),
    loadComponent: monthlyPage,
  },
  {
    path: 'jahr',
    title: () => yearViewTitle(berlinToday().slice(0, 4)),
    loadComponent: yearlyPage,
  },
  {
    path: 'jahr/:year',
    title: route => yearViewTitle(route.paramMap.get('year')),
    loadComponent: yearlyPage,
  },
  {
    path: 'statistiken',
    title: 'Rekorde',
    loadComponent: () => import('./pages/stats-page/stats-page').then(m => m.StatsPageComponent),
  },
  // Datenstand für Gäste (N04, US17-4): erreichbar über den Footer-Link „Status“.
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
