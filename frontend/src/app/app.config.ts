import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { routes } from './app.routes';
import { apiErrorInterceptor } from './interceptors/api-error.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AppTitleStrategy } from './utils/page-title';

registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Reihenfolge (03 B5.1): authInterceptor außen (setzt den Header, sieht Fehler erst nach der
    // Übersetzung und reicht die ApiErrorResponse unverändert weiter), apiErrorInterceptor innen.
    provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ]
};
