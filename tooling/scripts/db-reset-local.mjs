#!/usr/bin/env node
/**
 * DESTRUCTIVE: wipes the local D1 database's on-disk state
 * (`apps/api-worker/.wrangler/state/v3/d1`) so the next
 * `pnpm db:migrate:local` starts from an empty schema. Does not run
 * implicitly as part of `pnpm setup:local` or any other script — only run
 * this when you explicitly want to start over.
 *
 * Refuses to run unless the resolved target is exactly
 * `<repoRoot>/apps/api-worker/.wrangler/state/v3/d1`.
 */
import { existsSync, rmSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const target = resolve(repoRoot, 'apps', 'api-worker', '.wrangler', 'state', 'v3', 'd1');
const expectedRelative = ['apps', 'api-worker', '.wrangler', 'state', 'v3', 'd1'].join(sep);

const targetRelativeToRoot = relative(repoRoot, target);
const isExpectedSubpath = targetRelativeToRoot === expectedRelative && !targetRelativeToRoot.startsWith('..');

if (!isExpectedSubpath || target === repoRoot || target === resolve('/')) {
  console.error(`Refusing to delete "${target}" — it does not resolve to the expected local D1 state path.`);
  process.exit(1);
}

if (!existsSync(target)) {
  console.log('Local D1 state does not exist — nothing to reset.');
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
console.log('Deleted local D1 state. Run `pnpm db:migrate:local` (and `pnpm db:seed:local`) to rebuild it.');
