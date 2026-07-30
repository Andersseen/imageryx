/**
 * @imageryx/contracts
 *
 * Phase 1 exposes only the shared shape of a service health check, since it
 * is the one contract every app in this phase already implements
 * (dashboard, api-worker, delivery-worker, processing-worker). Request and
 * response contracts for uploads, transformations, and asset metadata are
 * introduced in a later phase alongside the services that implement them.
 */

export type ServiceStatus = 'healthy' | 'degraded' | 'down';

export type ServiceName = 'dashboard' | 'api-worker' | 'delivery-worker' | 'processing-worker';

export interface HealthCheckResponse {
  service: ServiceName;
  status: ServiceStatus;
  environment: string;
  version: string;
  timestamp: string;
}
