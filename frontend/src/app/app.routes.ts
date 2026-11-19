import { Routes } from '@angular/router';
import { berlinToday } from './utils/berlin-date';
import { longDateLabel, monthLabel, viewTitle } from './utils/page-title';

// Der Zeitraum im Titel ist die Vorbelegung (heute); die Seiten aktualisieren ihn bei Auswahlwechsel.
export const routes: Routes = [
  {
    path: '',
    title: () => viewTitle('Heute', longDateLabel(berlinToday())),
    loadComponent: () => import('./pages/today-page/today-page').then(m => m.TodayPageComponent),
  },
  {
    path: 'monat',
    title: () => { const t = berlinToday(); return viewTitle('Monat', monthLabel(t.slice(0, 4), t.slice(5, 7))); },
    loadComponent: () => import('./pages/monthly-page/monthly-page').then(m => m.MonthlyPageComponent),
  },
  {
    path: 'jahr',
    title: () => viewTitle('Jahr', berlinToday().slice(0, 4)),
    loadComponent: () => import('./pages/yearly-page/yearly-page').then(m => m.YearlyPageComponent),
  },
  {
    path: 'statistiken',
    title: 'Rekorde',
    loadComponent: () => import('./pages/stats-page/stats-page').then(m => m.StatsPageComponent),
  },
  { path: '**', redirectTo: '' },
];
