import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { provideVoltTheme } from '@voltui/components';
import { provideMovement } from 'angular-movement';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(),
    provideVoltTheme({ color: 'glacier', style: 'sharp', dark: true }),
    provideMovement(),
  ],
};
