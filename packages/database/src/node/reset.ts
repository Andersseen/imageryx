import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

export class UnsafeResetPathError extends Error {}

export interface ResetSelfHostedDatabaseResult {
  deleted: boolean;
}

/**
 * Deletes a self-hosted SQLite database file (plus its `-wal`/`-shm`
 * siblings, if present). `DATABASE_PATH` is user/deployment-configurable
 * (a real production self-host deploy sets it to something like
 * `/data/imageryx.db`), so unlike `tooling/scripts/db-reset-local.mjs`
 * (which only ever targets one hard-coded local path) this can't check
 * for an exact expected path — instead it refuses outright unless the
 * resolved path lives under `<repoRoot>/.local/`, with no override flag.
 * This is the "never automatically reset a configured production path"
 * requirement: a real deployment's `DATABASE_PATH` will never resolve
 * under a repo checkout's `.local/` directory at all.
 */
export function resetSelfHostedDatabase(
  path: string,
  repoRoot: string,
): ResetSelfHostedDatabaseResult {
  const resolvedPath = resolve(path);
  const localRoot = resolve(repoRoot, ".local") + sep;

  if (!resolvedPath.startsWith(localRoot)) {
    throw new UnsafeResetPathError(
      `Refusing to reset "${resolvedPath}" — it does not resolve under "${localRoot}". ` +
        "This guard exists so a configured production DATABASE_PATH can never be destroyed by this command.",
    );
  }

  let deleted = false;
  for (const candidate of [
    resolvedPath,
    `${resolvedPath}-wal`,
    `${resolvedPath}-shm`,
  ]) {
    if (existsSync(candidate)) {
      rmSync(candidate, { force: true });
      deleted = true;
    }
  }
  return { deleted };
}
