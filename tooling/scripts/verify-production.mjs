#!/usr/bin/env node
/**
 * Production write-path verification.
 *
 * Exercises the real deployed Imageryx stack end-to-end:
 *   authenticate → create canary project → upload fixture → poll metadata
 *   → request variant → poll variant → fetch original → fetch variant →
 *   validate → cleanup.
 *
 * Requires IMAGERYX_PRODUCTION_API_KEY in the environment. Never logs the
 * key. Never runs in CI automatically — invoke manually or via
 * workflow_dispatch.
 */
const WORKERS_SUBDOMAIN = process.env["CLOUDFLARE_WORKERS_SUBDOMAIN"] ?? "andriipap01";
const API_URL = process.env["API_URL"] ?? `https://imageryx-api-worker.${WORKERS_SUBDOMAIN}.workers.dev`;
const DELIVERY_URL = process.env["DELIVERY_URL"] ?? `https://imageryx-delivery-worker.${WORKERS_SUBDOMAIN}.workers.dev`;
const CANARY_PROJECT_SLUG = process.env["CANARY_PROJECT_SLUG"] ?? "imageryx-canary";
const CANARY_PRESET_SLUG = process.env["CANARY_PRESET_SLUG"] ?? "thumbnail";
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

const apiKey = process.env["IMAGERYX_PRODUCTION_API_KEY"];
if (!apiKey) {
  console.error("IMAGERYX_PRODUCTION_API_KEY is required.");
  process.exit(2);
}

const failures = [];
const diagnostics = { assetId: null, variantId: null, projectId: null, jobId: null };

function fail(step, message) {
  failures.push({ step, message });
  console.error(`  FAIL [${step}]: ${message}`);
}

function ok(step, detail) {
  console.log(`  ok   [${step}]${detail ? `: ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...(options.headers ?? {}),
  };
  const res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30_000) });
  return res;
}

async function apiJson(path, options = {}) {
  const res = await api(path, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json, ok: res.ok };
}

async function pollUntil(predicate, label) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const result = await predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out after ${POLL_TIMEOUT_MS}ms waiting for ${label}`);
}

function buildTinySvg() {
  return new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6" viewBox="0 0 8 6"><rect width="8" height="6" fill="#e2e8f0"/></svg>',
  );
}

async function main() {
  console.log("=== Imageryx production verification ===");
  console.log(`  API:      ${API_URL}`);
  console.log(`  Delivery: ${DELIVERY_URL}`);
  console.log(`  Canary:   ${CANARY_PROJECT_SLUG}`);
  console.log(`  Preset:   ${CANARY_PRESET_SLUG}`);
  console.log();

  // Step 1: Health check
  console.log("1. Health check");
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) ok("health", `${res.status}`);
    else fail("health", `status ${res.status}`);
  } catch (e) {
    fail("health", e instanceof Error ? e.message : String(e));
    console.error("\nAPI unreachable — aborting.");
    process.exit(1);
  }

  // Step 2: Resolve or create canary project
  console.log("2. Canary project");
  let projectId;
  try {
    const listRes = await apiJson("/v1/projects");
    if (!listRes.ok) {
      fail("project-list", `status ${listRes.status}`);
      return report();
    }
    const existing = listRes.json?.items?.find((p) => p.slug === CANARY_PROJECT_SLUG);
    if (existing) {
      projectId = existing.id;
      ok("project-resolve", `id=${projectId.slice(0, 8)}`);
    } else {
      const createRes = await apiJson("/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Imageryx Canary",
          slug: CANARY_PROJECT_SLUG,
          withSystemPresets: true,
        }),
      });
      if (!createRes.ok) {
        fail("project-create", `status ${createRes.status}: ${JSON.stringify(createRes.json)}`);
        return report();
      }
      projectId = createRes.json.id;
      ok("project-create", `id=${projectId.slice(0, 8)}`);
    }
    diagnostics.projectId = projectId;
  } catch (e) {
    fail("project", e instanceof Error ? e.message : String(e));
    return report();
  }

  // Step 3: Upload fixture
  console.log("3. Upload fixture");
  let assetId;
  try {
    const svgBytes = buildTinySvg();
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("path", "canary");
    form.set(
      "file",
      new Blob([svgBytes], { type: "image/svg+xml" }),
      "canary-verification.svg",
    );
    const res = await api("/v1/assets/upload", { method: "POST", body: form });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!res.ok) {
      fail("upload", `status ${res.status}: ${text.slice(0, 200)}`);
      return report();
    }
    assetId = json.asset.id;
    diagnostics.assetId = assetId;
    ok("upload", `asset=${assetId.slice(0, 8)}, status=${json.asset.processingStatus}`);
  } catch (e) {
    fail("upload", e instanceof Error ? e.message : String(e));
    return report();
  }

  // Step 4: Poll metadata processing
  console.log("4. Metadata processing");
  try {
    await pollUntil(async () => {
      const res = await apiJson(`/v1/assets/${assetId}`);
      if (!res.ok) return false;
      const status = res.json.processingStatus;
      if (status === "ready") {
        ok("metadata", `ready, ${res.json.width}x${res.json.height}`);
        return true;
      }
      if (status === "failed") {
        fail("metadata", "asset processing failed");
        return true;
      }
      return false;
    }, "metadata processing");
  } catch (e) {
    fail("metadata", e instanceof Error ? e.message : String(e));
  }

  // Step 5: Request variant
  console.log("5. Request variant");
  let variantId;
  let variantJobId;
  try {
    const presetsRes = await apiJson(`/v1/projects/${projectId}/presets`);
    if (!presetsRes.ok) {
      fail("presets-list", `status ${presetsRes.status}`);
    } else {
      const preset = presetsRes.json?.items?.find((p) => p.slug === CANARY_PRESET_SLUG);
      if (!preset) {
        fail("preset-resolve", `preset "${CANARY_PRESET_SLUG}" not found`);
      } else {
        const varRes = await apiJson(`/v1/assets/${assetId}/variants`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ presetId: preset.id }),
        });
        if (!varRes.ok) {
          fail("variant-request", `status ${varRes.status}: ${JSON.stringify(varRes.json)}`);
        } else {
          variantId = varRes.json.variant.id;
          variantJobId = varRes.json.jobId;
          diagnostics.variantId = variantId;
          diagnostics.jobId = variantJobId;
          ok("variant-request", `variant=${variantId.slice(0, 8)}, job=${variantJobId?.slice(0, 8) ?? "n/a"}`);
        }
      }
    }
  } catch (e) {
    fail("variant-request", e instanceof Error ? e.message : String(e));
  }

  // Step 6: Poll variant
  if (variantId) {
    console.log("6. Variant generation");
    try {
      await pollUntil(async () => {
        const res = await apiJson(`/v1/assets/${assetId}/variants`);
        if (!res.ok) return false;
        const variant = res.json?.find((v) => v.id === variantId);
        if (!variant) return false;
        if (variant.status === "ready") {
          ok("variant-ready", `provider=${variant.provider}, checksum=${variant.checksum?.slice(0, 12) ?? "?"}`);
          return true;
        }
        if (variant.status === "failed") {
          fail("variant-ready", "variant generation failed");
          return true;
        }
        return false;
      }, "variant generation");
    } catch (e) {
      fail("variant-ready", e instanceof Error ? e.message : String(e));
    }
  } else {
    console.log("6. Variant generation — skipped (no variant requested)");
  }

  // Step 7: Fetch original via delivery worker
  console.log("7. Delivery: original");
  try {
    const originalUrl = `${DELIVERY_URL}/${CANARY_PROJECT_SLUG}/assets/canary/canary-verification.svg`;
    const res = await fetch(originalUrl, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      const cl = res.headers.get("content-length") ?? "?";
      const cc = res.headers.get("cache-control") ?? "";
      const etag = res.headers.get("etag") ?? "";
      const nosniff = res.headers.get("x-content-type-options") ?? "";
      ok("delivery-original", `status=${res.status}, type=${ct}, size=${cl}, cache=${cc.slice(0, 40)}`);
      if (nosniff !== "nosniff") fail("delivery-original", "missing X-Content-Type-Options: nosniff");
      if (!etag) fail("delivery-original", "missing ETag");
      if (res.body) await res.body.cancel();
    } else {
      fail("delivery-original", `status ${res.status}`);
    }
  } catch (e) {
    fail("delivery-original", e instanceof Error ? e.message : String(e));
  }

  // Step 8: Fetch variant via delivery worker
  if (variantId) {
    console.log("8. Delivery: variant");
    try {
      const variantUrl = `${DELIVERY_URL}/${CANARY_PROJECT_SLUG}/assets/canary/canary-verification.svg/p/${CANARY_PRESET_SLUG}`;
      const res = await fetch(variantUrl, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        const cl = res.headers.get("content-length") ?? "?";
        const cc = res.headers.get("cache-control") ?? "";
        const simulated = res.headers.get("x-imageryx-simulated") ?? "";
        ok("delivery-variant", `status=${res.status}, type=${ct}, size=${cl}, simulated=${simulated || "false"}`);
        if (simulated === "true") fail("delivery-variant", "variant is simulated — Cloudinary was not used");
        if (!cc.includes("immutable")) fail("delivery-variant", `expected immutable cache, got: ${cc}`);
        if (res.body) await res.body.cancel();
      } else if (res.status === 404) {
        fail("delivery-variant", `404 — variant may not be ready yet or delivery path is wrong`);
      } else {
        fail("delivery-variant", `status ${res.status}`);
      }
    } catch (e) {
      fail("delivery-variant", e instanceof Error ? e.message : String(e));
    }
  } else {
    console.log("8. Delivery: variant — skipped");
  }

  // Step 9: Conditional request (If-None-Match)
  console.log("9. Conditional request");
  try {
    const originalUrl = `${DELIVERY_URL}/${CANARY_PROJECT_SLUG}/assets/canary/canary-verification.svg`;
    const first = await fetch(originalUrl, { signal: AbortSignal.timeout(15_000) });
    const etag = first.headers.get("etag");
    if (first.body) await first.body.cancel();
    if (etag) {
      const conditional = await fetch(originalUrl, {
        headers: { "if-none-match": etag },
        signal: AbortSignal.timeout(15_000),
      });
      if (conditional.status === 304) {
        ok("conditional", `304 Not Modified for ${etag}`);
      } else {
        fail("conditional", `expected 304, got ${conditional.status}`);
      }
    } else {
      fail("conditional", "no ETag from original to test against");
    }
  } catch (e) {
    fail("conditional", e instanceof Error ? e.message : String(e));
  }

  // Step 10: Cleanup — soft-delete the canary asset
  console.log("10. Cleanup");
  try {
    const res = await api(`/v1/assets/${assetId}`, { method: "DELETE" });
    if (res.ok) ok("cleanup", "asset soft-deleted");
    else fail("cleanup", `status ${res.status}`);
  } catch (e) {
    fail("cleanup", e instanceof Error ? e.message : String(e));
  }

  report();
}

function report() {
  console.log();
  console.log("=== Diagnostics ===");
  console.log(`  project:  ${diagnostics.projectId ?? "—"}`);
  console.log(`  asset:    ${diagnostics.assetId ?? "—"}`);
  console.log(`  variant:  ${diagnostics.variantId ?? "—"}`);
  console.log(`  job:      ${diagnostics.jobId ?? "—"}`);
  console.log();
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} check(s) failed.`);
    for (const f of failures) console.error(`  - [${f.step}] ${f.message}`);
    process.exit(1);
  }
  console.log("All production verification checks passed.");
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
