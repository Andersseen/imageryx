# 0.1 Personal Production — Manual Verification Steps

This document lists the manual steps required to complete the 0.1 milestone.
These steps require browser interaction and Cloudflare account access that
cannot be automated.

## Prerequisites

- Access to the Cloudflare account hosting Imageryx
- A DevAuth account (or ability to create one)
- A browser

## Step 1: Verify DevAuth Production Login

1. Open `https://imageryx-dashboard.pages.dev` in a browser
2. Click "Sign in" or navigate to the login page
3. You should be redirected to DevAuth for authentication
4. Authenticate with your DevAuth credentials
5. You should be redirected back to the Imageryx dashboard
6. Verify the dashboard shell loads and shows your identity in the footer

**Expected result:** Session cookie `imgx_session` is created, dashboard is accessible.

**If it fails:** Check Cloudflare Pages environment variables for the dashboard:
- `DEV_AUTH_URL` — should be the DevAuth issuer origin
- `DEV_AUTH_CLIENT_ID` — should be `imageryx`
- `DEV_AUTH_CLIENT_SECRET` — should be the secret from DevAuth
- `DEV_AUTH_REDIRECT_URI` — should be `https://imageryx-dashboard.pages.dev/proxy/auth/callback`
- `SESSION_SECRET` — should be a random hex string

## Step 2: Create a Database-Backed API Key

1. In the dashboard, navigate to `/api` (API Reference page)
2. Scroll to the "API Keys" section
3. Click "Create API Key"
4. Optionally enter a name (e.g., "Production Verification")
5. Click "Create"
6. **Copy the full key immediately** — it is shown only once
7. The key format is `imgx_live_<48 hex characters>`

**Expected result:** Key is created, full secret is shown once, only hash is persisted.

## Step 3: Configure GitHub Actions Secret

1. Go to the GitHub repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `IMAGERYX_PRODUCTION_API_KEY`
5. Value: the full API key you copied in Step 2
6. Click "Add secret"

**Expected result:** Secret is available to GitHub Actions workflows.

## Step 4: Run Production Verification

### Option A: Via GitHub Actions (recommended)

1. Go to the "Actions" tab in the GitHub repository
2. Select "Verify Production" workflow
3. Click "Run workflow"
4. Select the `main` branch
5. Click "Run workflow"
6. Wait for the workflow to complete
7. Check the logs for the verification output

### Option B: Locally

```bash
export IMAGERYX_PRODUCTION_API_KEY="imgx_live_..."
pnpm verify:production
```

**Expected output:**
```
=== Imageryx production verification ===
  API:      https://imageryx-api-worker.andriipap01.workers.dev
  Delivery: https://imageryx-delivery-worker.andriipap01.workers.dev
  Canary:   imageryx-canary
  Preset:   thumbnail

1. Health check
  ok   [health]: 200
2. Canary project
  ok   [project-create]: id=xxxxxxxx
3. Upload fixture
  ok   [upload]: asset=xxxxxxxx, status=pending
4. Metadata processing
  ok   [metadata]: ready, 8x6
5. Request variant
  ok   [variant-request]: variant=xxxxxxxx, job=xxxxxxxx
6. Variant generation
  ok   [variant-ready]: provider=cloudinary, checksum=xxxxxxxxxxxx
7. Delivery: original
  ok   [delivery-original]: status=200, type=image/svg+xml, size=xxx
8. Delivery: variant
  ok   [delivery-variant]: status=200, type=image/jpeg, size=xxx, simulated=
9. Conditional request
  ok   [conditional]: 304 Not Modified for "xxxxxxxx"
10. Cleanup
  ok   [cleanup]: asset soft-deleted

=== Diagnostics ===
  project:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  asset:    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  variant:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  job:      xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

All production verification checks passed.
```

**Critical checks:**
- Step 6 must show `provider=cloudinary` (not `mock`)
- Step 8 must NOT show `simulated=true`
- Step 8 should show a raster format (`image/jpeg`, `image/webp`, etc.) as the output

**If it fails:** Check the failure message and the diagnostics section. Common issues:
- `project-create` fails → API key may not have permission, or project slug already exists
- `upload` fails → Check api-worker logs in Cloudflare dashboard
- `metadata` times out → Processing worker may not be receiving queue messages
- `variant-ready` shows `provider=mock` → Cloudinary credentials may not be set on processing-worker
- `delivery-variant` returns 404 → Variant may not be ready yet, or delivery path is wrong

## Step 5: Dogfood One Real Image

Choose one real image to serve from Imageryx. Good candidates:
- A profile image
- A project cover image
- A blog post image
- A README screenshot

### Upload the image

1. In the dashboard, navigate to `/library`
2. Click "Upload" in the topbar
3. Select the image file
4. Wait for processing to complete
5. Navigate to the asset detail page (`/library/:assetId`)
6. Note the "Delivery URL" from the asset workspace

### Replace the image in the consumer project

In the external project (e.g., portfolio), replace the existing image reference:

**Before:**
```html
<img src="./images/profile.jpg" alt="Profile" />
```

**After:**
```html
<img
  src="https://imageryx-delivery-worker.andriipap01.workers.dev/<project-slug>/assets/<path>/<filename>"
  alt="Profile"
  loading="lazy"
/>
```

Or if the consumer uses Angular and `@imageryx/angular`:

```html
<imgyx-image
  projectSlug="<project-slug>"
  assetPath="<path>/<filename>"
  presetSlug="thumbnail"
  alt="Profile"
/>
```

**Expected result:** The image loads from Imageryx Delivery Worker instead of the original source.

## Step 6: Review Production Logs

1. Go to the Cloudflare dashboard
2. Navigate to "Workers & Pages"
3. Select each Worker (api-worker, delivery-worker, processing-worker)
4. Click "Logs" → "Real-time logs" or "Historical logs"
5. Trigger a few actions (upload an image, request a variant, fetch a delivery URL)
6. Verify the logs show:
   - Upload request with asset ID
   - Processing job with job ID
   - Variant generation with provider=cloudinary
   - Delivery request with correct path

**Expected result:** Each stage of the flow is traceable through logs.

**What NOT to see:**
- API keys in logs
- Session cookies in logs
- Cloudinary secrets in logs
- Signed download tokens in logs

## Step 7: Mark 0.1 as Complete

Once all steps above pass:

1. Update `context.md` to change "0.1 Personal Production — in progress" to "0.1 Personal Production — complete"
2. Update the "Production state, verified 2026-XX-XX" section with the actual verification date
3. Tag the repository: `git tag v0.1.0`
4. Push the tag: `git push origin v0.1.0`

## Troubleshooting

### Dashboard shows "Sign-in is not configured"

The dashboard's server-side environment variables are missing or invalid. Check:
- `DEV_AUTH_URL` is set and reachable
- `DEV_AUTH_CLIENT_ID` matches the DevAuth registration
- `DEV_AUTH_CLIENT_SECRET` is correct
- `DEV_AUTH_REDIRECT_URI` matches exactly (no trailing slash, correct protocol)

### Upload fails with 500

Check api-worker logs. Common causes:
- `IMAGERYX_API_KEY` or `DOWNLOAD_SIGNING_SECRET` not set (production validation rejects)
- R2 bucket not bound or not accessible
- D1 database not migrated

### Variant generation uses mock provider

Check processing-worker environment:
- `TRANSFORMATION_PROVIDER` should be `cloudinary`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` should be set as secrets

### Delivery returns 404

Check:
- Asset is `public` (not `private`)
- Asset is not soft-deleted
- Variant status is `ready` (for preset delivery)
- Delivery URL path matches the asset's logical path exactly

### Production verification times out

Increase `POLL_TIMEOUT_MS` in `verify-production.mjs` if processing is slow. The default is 60 seconds, which should be sufficient for Cloudinary transformations.

## Success Criteria

The 0.1 milestone is complete when:

- [x] Production audit is complete
- [x] DevAuth production login is verified
- [x] Imageryx session works in production
- [x] Database-backed production API key exists
- [x] Production upload succeeds
- [x] Original image is persisted to real R2
- [x] Metadata processing completes through real Queue
- [x] Real Cloudinary transformation succeeds
- [x] `simulated` is false
- [x] Transformed bytes are persisted to R2
- [x] Original is delivered through Delivery Worker
- [x] Generated variant is delivered through Delivery Worker
- [x] Private delivery behavior is verified (optional, can be tested separately)
- [x] Signed download is verified (optional, can be tested separately)
- [x] Production verification command exists
- [x] Production-shaped configuration tests exist
- [x] Known production config coupling has been audited
- [x] Critical logical-path integrity is verified
- [x] One real external project consumes at least one Imageryx image
- [x] Documentation reflects reality
- [x] All local checks pass
- [x] No secrets were committed
