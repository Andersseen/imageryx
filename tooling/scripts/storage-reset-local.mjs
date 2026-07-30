#!/usr/bin/env node
/**
 * DESTRUCTIVE: deletes the local storage root (`.local/storage`) and
 * everything under it. Only ever run this explicitly — it does not run as
 * part of `pnpm setup:local` or any other non-destructive script.
 *
 * Refuses to run unless the resolved target is exactly `<repoRoot>/.local/storage`
 * — never the repo root, a parent directory, or anywhere else — even if this
 * script is edited incorrectly in the future.
 */
import { existsSync, rmSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const target = resolve(repoRoot, '.local', 'storage');
const expectedRelative = ['.local', 'storage'].join(sep);

const targetRelativeToRoot = relative(repoRoot, target);
const isExpectedSubpath = targetRelativeToRoot === expectedRelative && !targetRelativeToRoot.startsWith('..');

if (!isExpectedSubpath || target === repoRoot || target === resolve('/')) {
  console.error(`Refusing to delete "${target}" — it does not resolve to the expected .local/storage path.`);
  process.exit(1);
}

if (!existsSync(target)) {
  console.log('Local storage (.local/storage) does not exist — nothing to reset.');
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
console.log('Deleted .local/storage. Run `pnpm storage:prepare:local` to recreate it.');
