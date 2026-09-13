import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { apiErrorInterceptor } from './core/api-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // State is signals end to end and RxJS never drives the view, so zone.js
    // would be pure overhead. Confirmed against ngx-charts in Task 9 - if that
    // fails, this line becomes provideZoneChangeDetection() and nothing else changes.
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideAnimationsAsync(),
  ],
};
