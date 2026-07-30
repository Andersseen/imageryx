#!/usr/bin/env node
/**
 * One-shot local environment setup: prepares local storage, applies D1
 * migrations, seeds local data, then prints status. Safe to re-run —
 * every step it calls is itself idempotent. Never runs a destructive
 * reset script.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const steps = [
  ['storage:prepare:local', 'Preparing local storage'],
  ['db:migrate:local', 'Applying local D1 migrations'],
  ['db:seed:local', 'Seeding local data'],
  ['db:status:local', 'Local D1 migration status'],
];

for (const [script, label] of steps) {
  console.log(`\n=== ${label} (pnpm ${script}) ===`);
  const result = spawnSync('pnpm', ['run', script], { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nSetup failed at step "${script}".`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nLocal Imageryx setup complete. No secrets were printed above.');
