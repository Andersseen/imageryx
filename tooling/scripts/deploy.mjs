#!/usr/bin/env node
/**
 * Orchestrates a real production deploy in the documented, dependency-safe
 * order: validate config → migrate D1 → processing-worker → api-worker →
 * delivery-worker → dashboard → web → smoke check. Needs real Cloudflare
 * credentials (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) and the two
 * production secrets already set via `wrangler secret put` (see README's
 * "Deployment" section) — this script does not set them and does not run
 * any destructive database command.
 *
 * Deploying api-worker before its own D1 migration would risk it running
 * code that expects a column/table that isn't there yet; deploying
 * dashboard/web before the Workers they call would just mean the first
 * real request briefly 404s/errors, not a data-integrity risk — that's
 * why the Workers are ordered by dependency and the two Pages apps go last.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nDeploy failed at: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n=== 1/8: Validating deploy configuration ===');
run('pnpm', ['run', 'deploy:validate']);

console.log('\n=== 2/8: Applying production D1 migrations ===');
run('pnpm', ['--filter', '@imageryx/api-worker', 'run', 'db:migrate:production']);

console.log('\n=== 3/8: Deploying processing-worker ===');
run('pnpm', ['--filter', '@imageryx/processing-worker', 'run', 'deploy']);

console.log('\n=== 4/8: Deploying api-worker ===');
run('pnpm', ['--filter', '@imageryx/api-worker', 'run', 'deploy']);

console.log('\n=== 5/8: Deploying delivery-worker ===');
run('pnpm', ['--filter', '@imageryx/delivery-worker', 'run', 'deploy']);

console.log('\n=== 6/8: Deploying dashboard ===');
run('pnpm', ['--filter', '@imageryx/dashboard', 'run', 'build']);
run('pnpm', ['--filter', '@imageryx/dashboard', 'run', 'deploy']);

console.log('\n=== 7/8: Deploying web ===');
run('pnpm', ['--filter', '@imageryx/web', 'run', 'build']);
run('pnpm', ['--filter', '@imageryx/web', 'run', 'deploy']);

console.log('\n=== 8/8: Smoke check ===');
run('pnpm', ['run', 'smoke:production']);

console.log('\nDeploy complete.');
