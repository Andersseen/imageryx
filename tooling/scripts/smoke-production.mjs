#!/usr/bin/env node
/**
 * Non-destructive production smoke check: confirms every deployed URL
 * actually responds, and — only if `IMAGERYX_API_KEY` is set in the
 * environment — checks api-worker's authenticated diagnostics routes for
 * real database/storage/provider state. Never uploads, writes, or deletes
 * anything; a missing API key just skips the authenticated checks with a
 * clear note, it doesn't fail the whole run.
 */
/**
 * A workers.dev hostname is `<worker>.<account-subdomain>.workers.dev` — the account
 * subdomain is not optional, and a name without it does not resolve at all. This script
 * originally hardcoded `imageryx-api-worker.workers.dev`, so every Worker check failed on
 * DNS and `pnpm smoke:production` could never pass, whatever the deployment's real state.
 * CI names the same three URLs (see `deploy-workers` in .github/workflows/ci.yml); they are
 * env-overridable here so a different account, or a custom domain, does not need a code edit.
 */
const WORKERS_SUBDOMAIN = process.env['CLOUDFLARE_WORKERS_SUBDOMAIN'] ?? 'andriipap01';
const workerUrl = (worker) => `https://imageryx-${worker}.${WORKERS_SUBDOMAIN}.workers.dev`;

const URLS = {
  dashboard: process.env['DASHBOARD_URL'] ?? 'https://imageryx-dashboard.pages.dev',
  web: process.env['WEB_URL'] ?? 'https://imageryx-web.pages.dev',
  apiWorker: process.env['API_URL'] ?? workerUrl('api-worker'),
  deliveryWorker: process.env['DELIVERY_URL'] ?? workerUrl('delivery-worker'),
  processingWorker: process.env['PROCESSING_URL'] ?? workerUrl('processing-worker'),
};

const apiKey = process.env['IMAGERYX_API_KEY'];
let failed = false;

async function checkUrl(label, url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    const ok = options.expectStatus ? response.status === options.expectStatus : response.ok;
    console.log(`${ok ? '✓' : '✗'} ${label}: ${response.status} ${url}`);
    if (!ok) failed = true;
    return response;
  } catch (error) {
    console.log(`✗ ${label}: unreachable — ${error instanceof Error ? error.message : error}`);
    failed = true;
    return null;
  }
}

async function main() {
  console.log('=== Public health checks ===');
  await checkUrl('dashboard', URLS.dashboard);
  await checkUrl('web', URLS.web);
  await checkUrl('api-worker /health', `${URLS.apiWorker}/health`);
  await checkUrl('delivery-worker /health', `${URLS.deliveryWorker}/health`);
  await checkUrl('processing-worker /health', `${URLS.processingWorker}/health`);

  if (!apiKey) {
    console.log(
      '\nIMAGERYX_API_KEY not set — skipping authenticated diagnostics checks (database/storage/provider state).',
    );
  } else {
    console.log('\n=== Authenticated diagnostics ===');
    const headers = { Authorization: `Bearer ${apiKey}` };
    await checkUrl('database diagnostics', `${URLS.apiWorker}/v1/diagnostics/database`, { headers });
    await checkUrl('providers diagnostics', `${URLS.apiWorker}/v1/diagnostics/providers`, { headers });
    await checkUrl('domain diagnostics', `${URLS.apiWorker}/v1/diagnostics/domain`, { headers });
  }

  if (failed) {
    console.error('\nSmoke check found at least one failure — see above.');
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main();
