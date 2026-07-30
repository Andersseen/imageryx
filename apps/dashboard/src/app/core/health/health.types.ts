import type { HealthCheckResponse } from "@imageryx/contracts";

export type ServiceHealthState =
  | { status: "loading" }
  | { status: "success"; data: HealthCheckResponse }
  | { status: "error"; message: string };
