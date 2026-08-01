#!/usr/bin/env node
/**
 * Validates every app's production deploy configuration without deploying
 * anything and without needing real Cloudflare credentials for the three
 * Workers (`wrangler deploy --dry-run` only parses/bundles). Run this
 * before a real `pnpm deploy` — it catches a broken wrangler.jsonc, a
 * missing secret warning, or a build failure early, for free.
 *
 * `dashboard`/`web` are Cloudflare Pages, not Workers — `wrangler deploy
 * --dry-run` doesn't apply to them the same way, so this validates their
 * production build instead (the same build `wrangler pages deploy` would
 * publish).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const workerApps = ['api-worker', 'delivery-worker', 'processing-worker'];
const pagesApps = ['dashboard', 'web'];

let failed = false;

for (const app of workerApps) {
  console.log(`\n=== ${app}: wrangler deploy --dry-run --env production ===`);
  const result = spawnSync(
    'pnpm',
    ['--filter', `@imageryx/${app}`, 'exec', 'wrangler', 'deploy', '--dry-run', '--env', 'production'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) failed = true;
}

for (const app of pagesApps) {
  console.log(`\n=== ${app}: production build ===`);
  const result = spawnSync('pnpm', ['--filter', `@imageryx/${app}`, 'run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) failed = true;
}

if (failed) {
  console.error('\ndeploy:validate found at least one failure — see above.');
  process.exit(1);
}

console.log('\nAll five apps validated. No secrets were checked or printed — see README\'s');
console.log('"Deployment" section for the one-time `wrangler secret put` step before a real deploy.');
