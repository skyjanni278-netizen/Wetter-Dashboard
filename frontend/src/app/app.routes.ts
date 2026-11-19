import { Routes } from '@angular/router';
import { berlinToday } from './utils/berlin-date';
import { dayViewTitle, monthViewTitle, yearViewTitle } from './utils/page-title';

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
  { path: '**', redirectTo: '' },
];
