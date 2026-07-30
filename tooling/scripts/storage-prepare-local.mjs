#!/usr/bin/env node
/**
 * Ensures the shared local Wrangler state directory exists. As of Phase 3,
 * local "storage" is the R2 bucket Miniflare simulates locally (no
 * Cloudflare account/credentials needed) under `.wrangler-state/v3/r2`,
 * shared by every `wrangler dev` process and the seed script via
 * `--persist-to` / `defaultPersistRoot` — see context.md's "Local-mode
 * architecture" note. This directory is created lazily by Wrangler/Miniflare
 * on first write anyway; this script just makes the step explicit and
 * gives `pnpm setup:local` something concrete to report.
 */
import { mkdirSync } from 'node:fs';

const stateRoot = new URL('../../.wrangler-state/v3', import.meta.url);

mkdirSync(stateRoot, { recursive: true });

console.log('Local Wrangler state directory ready at .wrangler-state/v3 (D1 + R2 + Queues).');
