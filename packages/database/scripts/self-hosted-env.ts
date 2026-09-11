import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");

const DEFAULT_DATABASE_PATH = ".local/self-hosted/imageryx.db";

/** `DATABASE_PATH` is documented as repo-root-relative for local dev (`.local/self-hosted/imageryx.db`) and absolute for a real self-host deployment (`/data/imageryx.db`) — resolved the same way here as `apps/self-hosted` resolves it at runtime. */
export function resolveSelfHostedDatabasePath(): string {
  const configured = process.env["DATABASE_PATH"] ?? DEFAULT_DATABASE_PATH;
  return isAbsolute(configured) ? configured : resolve(repoRoot, configured);
}
