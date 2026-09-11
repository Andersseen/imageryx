/**
 * Re-exports exactly the pieces of this Worker that are runtime-independent
 * — no `c.env.*` binding access beyond `c.get("db")`, no R2/Queue/Cloudflare
 * Images. `apps/self-hosted` imports from here (never from `./index`) to
 * reuse the real `/v1/projects` route and shared middleware against a
 * `SqliteDatabaseClient` instead of a `D1DatabaseClient`. Every export here
 * was verified by direct inspection to have zero Cloudflare-binding
 * references beyond the database — see this PR's audit notes in
 * context.md's "Self-host Phase A" section.
 */
export type { AppVariables } from "./lib/app-variables";
export { errorHandler, notFoundHandler } from "./middleware/error-handler";
export { structuredLogger } from "./middleware/logger";
export { requestId } from "./middleware/request-id";
export { projectsRoute } from "./routes/v1/projects";
