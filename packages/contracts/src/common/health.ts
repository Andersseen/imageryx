/**
 * Carried over from Phase 1 unchanged — every app already imports these
 * three names from `@imageryx/contracts` (the package root), so they keep
 * living behind that same barrel export even though the source moved into
 * `common/` alongside the rest of the domain-organized schemas.
 */
export type ServiceStatus = "healthy" | "degraded" | "down";

export type ServiceName =
  | "dashboard"
  | "api-worker"
  | "delivery-worker"
  | "processing-worker";

export interface HealthCheckResponse {
  service: ServiceName;
  status: ServiceStatus;
  environment: string;
  version: string;
  timestamp: string;
}
