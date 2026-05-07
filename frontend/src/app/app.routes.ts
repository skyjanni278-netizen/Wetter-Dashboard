import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/today-page/today-page').then(m => m.TodayPageComponent) },
  { path: 'monat', loadComponent: () => import('./pages/monthly-page/monthly-page').then(m => m.MonthlyPageComponent) },
  { path: 'jahr', loadComponent: () => import('./pages/yearly-page/yearly-page').then(m => m.YearlyPageComponent) },
  { path: 'statistiken', loadComponent: () => import('./pages/stats-page/stats-page').then(m => m.StatsPageComponent) },
  { path: '**', redirectTo: '' },
];
