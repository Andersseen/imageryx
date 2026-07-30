export interface DashboardEnv {
  appEnv: string;
  apiUrl: string;
  deliveryUrl: string;
  processingUrl: string;
}

const DEFAULTS = {
  appEnv: 'development',
  apiUrl: 'http://localhost:8787',
  deliveryUrl: 'http://localhost:8788',
  processingUrl: 'http://localhost:8789',
} as const;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function readVar(raw: Record<string, string | undefined>, key: string, fallback: string): string {
  const value = raw[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Single place the dashboard reads Vite-exposed `VITE_*` env vars from, so
 * every consumer (health checks, environment badge) agrees on the same
 * defaults instead of each reading `import.meta.env` directly.
 */
export function parseDashboardEnv(raw: Record<string, string | undefined>): DashboardEnv {
  return {
    appEnv: readVar(raw, 'VITE_APP_ENV', DEFAULTS.appEnv),
    apiUrl: stripTrailingSlash(readVar(raw, 'VITE_API_URL', DEFAULTS.apiUrl)),
    deliveryUrl: stripTrailingSlash(readVar(raw, 'VITE_DELIVERY_URL', DEFAULTS.deliveryUrl)),
    processingUrl: stripTrailingSlash(readVar(raw, 'VITE_PROCESSING_URL', DEFAULTS.processingUrl)),
  };
}
