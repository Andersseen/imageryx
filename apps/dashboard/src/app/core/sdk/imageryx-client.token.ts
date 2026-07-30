import { InjectionToken, inject } from "@angular/core";
import { createImageryxClient, type ImageryxClient } from "@imageryx/sdk";
import { DASHBOARD_ENV } from "../env/dashboard-env.token";

/**
 * `baseUrl: "/api"` — a relative, same-origin path, not `env.apiUrl`
 * directly. `/v1/*` requires a Bearer API key (see api-worker's
 * `src/middleware/auth.ts`), so every SDK call from this browser client
 * goes through the server-side proxy (`src/server/routes/api/[...path].ts`)
 * instead of api-worker directly — no `apiKey` is configured here because
 * none is ever available in browser code. `deliveryUrl` is called
 * directly: delivery routes are public/unauthenticated reads by design.
 */
export const IMAGERYX_CLIENT = new InjectionToken<ImageryxClient>("IMAGERYX_CLIENT", {
  factory: () => {
    const env = inject(DASHBOARD_ENV);
    return createImageryxClient({ baseUrl: "/api", deliveryUrl: env.deliveryUrl });
  },
});
