#!/usr/bin/env node
/**
 * Creates the local storage root (`.local/storage`) used by
 * `LocalStorageProvider` in local development, matching
 * `LOCAL_STORAGE_PATH` in `.env.example` / `apps/api-worker/wrangler.jsonc`.
 */
import { mkdirSync } from 'node:fs';

const storagePath = new URL('../../.local/storage', import.meta.url);

mkdirSync(storagePath, { recursive: true });

console.log('Local storage ready at .local/storage');
