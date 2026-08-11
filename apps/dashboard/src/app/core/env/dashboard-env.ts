export interface DashboardEnv {
  appEnv: string;
  apiUrl: string;
  deliveryUrl: string;
  processingUrl: string;
}

type RawEnv = Record<string, string | boolean | undefined>;

const DEVELOPMENT_DEFAULTS = {
  appEnv: "development",
  apiUrl: "http://localhost:8787",
  deliveryUrl: "http://localhost:8788",
  processingUrl: "http://localhost:8789",
} as const;

const PRODUCTION_DEFAULTS = {
  appEnv: "production",
  apiUrl: "https://imageryx-api-worker.workers.dev",
  deliveryUrl: "https://imageryx-delivery-worker.workers.dev",
  processingUrl: "https://imageryx-processing-worker.workers.dev",
} as const;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function readVar(
  raw: RawEnv,
  key: string,
  fallback: string,
): string {
  const value = raw[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function isProduction(raw: RawEnv): boolean {
  return raw["PROD"] === true || raw["PROD"] === "true";
}

/**
 * Single place the dashboard reads Vite-exposed `VITE_*` env vars from, so
 * every consumer (health checks, environment badge) agrees on the same
 * defaults instead of each reading `import.meta.env` directly.
 */
export function parseDashboardEnv(
  raw: RawEnv,
): DashboardEnv {
  const defaults = isProduction(raw) ? PRODUCTION_DEFAULTS : DEVELOPMENT_DEFAULTS;
  return {
    appEnv: readVar(raw, "VITE_APP_ENV", defaults.appEnv),
    apiUrl: stripTrailingSlash(readVar(raw, "VITE_API_URL", defaults.apiUrl)),
    deliveryUrl: stripTrailingSlash(
      readVar(raw, "VITE_DELIVERY_URL", defaults.deliveryUrl),
    ),
    processingUrl: stripTrailingSlash(
      readVar(raw, "VITE_PROCESSING_URL", defaults.processingUrl),
    ),
  };
}
