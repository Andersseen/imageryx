import type { HealthCheckResponse, ServiceName } from "@imageryx/contracts";

export * from "./fixtures/asset.fixture";
export * from "./fixtures/decodable-image.fixture";
export * from "./fixtures/folder.fixture";
export * from "./fixtures/image-bytes.fixture";
export * from "./fixtures/preset.fixture";
export * from "./fixtures/processing-job.fixture";
export * from "./fixtures/project.fixture";

const SERVICE_NAMES: readonly ServiceName[] = [
  "dashboard",
  "api-worker",
  "delivery-worker",
  "processing-worker",
];

const STATUSES = ["healthy", "degraded", "down"];

/**
 * Runtime shape check for a `/health` response body, shared by every
 * Phase 1 Worker's health route test so the contract is verified the same
 * way everywhere instead of re-implemented per app.
 */
export function isValidHealthCheckResponse(
  value: unknown,
  expectedService?: ServiceName,
): value is HealthCheckResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    typeof body["service"] === "string" &&
    SERVICE_NAMES.includes(body["service"] as ServiceName) &&
    (expectedService === undefined || body["service"] === expectedService) &&
    typeof body["status"] === "string" &&
    STATUSES.includes(body["status"] as string) &&
    typeof body["environment"] === "string" &&
    body["environment"].length > 0 &&
    typeof body["version"] === "string" &&
    body["version"].length > 0 &&
    typeof body["timestamp"] === "string" &&
    !Number.isNaN(Date.parse(body["timestamp"]))
  );
}
