#!/usr/bin/env node
/**
 * Prints one cryptographically random secret, suitable for
 * IMAGERYX_API_KEY or DOWNLOAD_SIGNING_SECRET in production. Printed once,
 * to stdout only — never written to any file, committed or not. Pipe it
 * straight into `wrangler secret put` (see README's "Deployment" section
 * and docs/deployment-cloudflare.md) rather than pasting it anywhere that
 * gets saved.
 */
import { randomBytes } from 'node:crypto';

console.log(randomBytes(32).toString('hex'));
