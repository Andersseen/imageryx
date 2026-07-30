#!/usr/bin/env node
/**
 * Fails fast if the Phase 1 monorepo structure or expected root config
 * files go missing, so a broken workspace is caught before install/build.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

const expectedApps = ['dashboard', 'api-worker', 'delivery-worker', 'processing-worker'];
const expectedPackages = [
  'contracts',
  'database',
  'image-core',
  'providers',
  'sdk',
  'angular',
  'test-utils',
  'typescript-config',
  'eslint-config',
];
const expectedRootFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.editorconfig',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
];

/** @type {string[]} */
const missing = [];

for (const app of expectedApps) {
  const path = join(root, 'apps', app, 'package.json');
  if (!existsSync(path)) missing.push(`apps/${app}/package.json`);
}

for (const pkg of expectedPackages) {
  const path = join(root, 'packages', pkg, 'package.json');
  if (!existsSync(path)) missing.push(`packages/${pkg}/package.json`);
}

for (const file of expectedRootFiles) {
  if (!existsSync(join(root, file))) missing.push(file);
}

if (missing.length > 0) {
  console.error('Monorepo structure check failed. Missing:');
  for (const entry of missing) console.error(`  - ${entry}`);
  process.exit(1);
}

console.log(`Monorepo structure OK: ${expectedApps.length} apps, ${expectedPackages.length} packages.`);
