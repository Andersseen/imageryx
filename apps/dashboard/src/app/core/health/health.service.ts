import { Injectable, inject, signal, type WritableSignal } from "@angular/core";
import type { HealthCheckResponse } from "@imageryx/contracts";
import { DASHBOARD_ENV } from "../env/dashboard-env.token";
import type { ApiInfo, ApiInfoState } from "./api-info.types";
import type { ServiceHealthState } from "./health.types";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Fetches `/health` from every Phase 1 Worker (and `/v1/info` from
 * api-worker) and exposes the results as signals. Every fetch is real —
 * there are no hardcoded "healthy" states.
 */
@Injectable({ providedIn: "root" })
export class HealthService {
  private readonly env = inject(DASHBOARD_ENV);

  readonly apiWorker = signal<ServiceHealthState>({ status: "loading" });
  readonly deliveryWorker = signal<ServiceHealthState>({ status: "loading" });
  readonly processingWorker = signal<ServiceHealthState>({ status: "loading" });
  readonly apiInfo = signal<ApiInfoState>({ status: "loading" });

  constructor() {
    this.refresh();
  }

  refresh(): void {
    void this.loadHealth(this.env.apiUrl, this.apiWorker);
    void this.loadHealth(this.env.deliveryUrl, this.deliveryWorker);
    void this.loadHealth(this.env.processingUrl, this.processingWorker);
    void this.loadInfo();
  }

  private async loadHealth(
    baseUrl: string,
    target: WritableSignal<ServiceHealthState>,
  ): Promise<void> {
    target.set({ status: "loading" });
    try {
      const data = await fetchJson<HealthCheckResponse>(`${baseUrl}/health`);
      target.set({ status: "success", data });
    } catch (error) {
      target.set({ status: "error", message: toErrorMessage(error) });
    }
  }

  private async loadInfo(): Promise<void> {
    this.apiInfo.set({ status: "loading" });
    try {
      // Relative, same-origin path: /v1/* now requires a Bearer API key (see
      // src/middleware/auth.ts in api-worker), so this goes through the server-side
      // proxy (src/server/routes/api/[...path].ts) instead of calling api-worker
      // directly — the browser never needs to hold the key. /health (above) stays
      // direct since it's outside /v1/* and unauthenticated.
      const data = await fetchJson<ApiInfo>("/api/v1/info");
      this.apiInfo.set({ status: "success", data });
    } catch (error) {
      this.apiInfo.set({ status: "error", message: toErrorMessage(error) });
    }
  }
}
