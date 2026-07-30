#!/usr/bin/env node
/**
 * DESTRUCTIVE: deletes the local R2 simulator's on-disk state
 * (`.wrangler-state/v3/r2`) so the next upload starts from an empty
 * bucket. Only ever run this explicitly — it does not run as part of
 * `pnpm setup:local` or any other non-destructive script.
 *
 * Refuses to run unless the resolved target is exactly
 * `<repoRoot>/.wrangler-state/v3/r2` — never the repo root, a parent
 * directory, or anywhere else — even if this script is edited incorrectly
 * in the future.
 */
import { existsSync, rmSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const target = resolve(repoRoot, '.wrangler-state', 'v3', 'r2');
const expectedRelative = ['.wrangler-state', 'v3', 'r2'].join(sep);

const targetRelativeToRoot = relative(repoRoot, target);
const isExpectedSubpath = targetRelativeToRoot === expectedRelative && !targetRelativeToRoot.startsWith('..');

if (!isExpectedSubpath || target === repoRoot || target === resolve('/')) {
  console.error(`Refusing to delete "${target}" — it does not resolve to the expected local R2 state path.`);
  process.exit(1);
}

if (!existsSync(target)) {
  console.log('Local R2 state (.wrangler-state/v3/r2) does not exist — nothing to reset.');
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
console.log('Deleted local R2 state. Re-run `pnpm setup:local` (or just start uploading) to recreate it.');
