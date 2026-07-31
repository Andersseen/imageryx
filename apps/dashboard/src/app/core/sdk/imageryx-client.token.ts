import { InjectionToken, inject } from "@angular/core";
import { createImageryxClient, type ImageryxClient } from "@imageryx/sdk";
import { DASHBOARD_ENV } from "../env/dashboard-env.token";

/**
 * `baseUrl: "/proxy"` — a relative, same-origin path, not `env.apiUrl`
 * directly. `/v1/*` requires a Bearer API key (see api-worker's
 * `src/middleware/auth.ts`), so every SDK call from this browser client
 * goes through the server-side proxy (`src/server/routes/proxy/[...path].ts`)
 * instead of api-worker directly — no `apiKey` is configured here because
 * none is ever available in browser code. `deliveryUrl` is called
 * directly: delivery routes are public/unauthenticated reads by design.
 *
 * Deliberately not `/api`: that's the dashboard's own API-reference page
 * route, and a same-named server proxy directory shadows it for a direct
 * load or refresh (see the proxy file's own comment).
 */
export const IMAGERYX_CLIENT = new InjectionToken<ImageryxClient>(
  "IMAGERYX_CLIENT",
  {
    factory: () => {
      const env = inject(DASHBOARD_ENV);
      return createImageryxClient({
        baseUrl: "/proxy",
        deliveryUrl: env.deliveryUrl,
      });
    },
  },
);
