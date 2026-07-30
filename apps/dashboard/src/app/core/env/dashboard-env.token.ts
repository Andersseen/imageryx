import { InjectionToken } from '@angular/core';
import { parseDashboardEnv, type DashboardEnv } from './dashboard-env';

export const DASHBOARD_ENV = new InjectionToken<DashboardEnv>('DASHBOARD_ENV', {
  factory: () => parseDashboardEnv(import.meta.env as unknown as Record<string, string | undefined>),
});
