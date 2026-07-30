import type { ServiceHealthState } from "./health.types";

export type StatusTone = "positive" | "warning" | "negative" | "neutral";

export interface ServiceStatusDescription {
  label: string;
  tone: StatusTone;
}

/**
 * Pure mapping from a service's raw health-check state to what the
 * dashboard displays (label + color tone). Kept separate from
 * `HealthService` so it can be unit tested without a fetch/DI harness.
 */
export function describeServiceHealth(
  state: ServiceHealthState,
): ServiceStatusDescription {
  if (state.status === "loading") {
    return { label: "Checking…", tone: "neutral" };
  }

  if (state.status === "error") {
    return { label: "Unreachable", tone: "negative" };
  }

  switch (state.data.status) {
    case "healthy":
      return { label: "Healthy", tone: "positive" };
    case "degraded":
      return { label: "Degraded", tone: "warning" };
    case "down":
      return { label: "Down", tone: "negative" };
  }
}
