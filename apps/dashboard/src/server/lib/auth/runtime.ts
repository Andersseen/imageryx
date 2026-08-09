import { defineEventHandler, type EventHandler, type H3Event } from "h3";
import { AuthConfigError, readAuthConfig } from "./config";
import { createDiscoveryLoader } from "./discovery";
import { renderAuthFailure } from "./failure";
import type { AuthDeps } from "./handlers";

/**
 * Wires the handlers to the real world: the process environment, the platform
 * `fetch`, and one shared discovery cache.
 *
 * The loader is module-level so its cache is shared across requests, but the
 * config is read per request rather than at import time — under the Cloudflare
 * Pages preset the environment is attached per request, so a module-load read
 * would see nothing.
 */

const loadDiscovery = createDiscoveryLoader();

export function resolveAuthDeps(): AuthDeps {
  return {
    config: readAuthConfig(process.env as Record<string, string | undefined>),
    loadDiscovery,
  };
}

/**
 * Turns a missing/invalid configuration into the friendly "not configured" page
 * instead of Nitro's generic error page. The specific missing variable is
 * logged, never rendered.
 */
export function defineAuthRoute(
  handler: (event: H3Event, deps: AuthDeps) => Promise<string | void>,
): EventHandler {
  return defineEventHandler(async (event) => {
    let deps: AuthDeps;
    try {
      deps = resolveAuthDeps();
    } catch (error) {
      if (error instanceof AuthConfigError) {
        console.error(`[auth] not configured: ${error.message}`);
        return renderAuthFailure(event, "not_configured");
      }
      throw error;
    }
    return handler(event, deps);
  });
}
