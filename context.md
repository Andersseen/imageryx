# context.md

Working context for anyone (human or AI) picking up this repository. For
the phase breakdown see [ROADMAP.md](ROADMAP.md); for how the apps fit
together see [ARCHITECTURE.md](ARCHITECTURE.md).

## Product definition

Imageryx is an open, provider-independent image delivery and
transformation platform. Upload once, transform on request, serve from the
edge — without locking storage or transformation logic to a single vendor
(no direct R2/Cloudinary/etc. SDK calls outside the `providers` package).

## Current phase status

**Phase 1 — Repository Foundation, complete.** The monorepo structure
exists; the dashboard and all three Workers start locally; health
endpoints are real (not hardcoded); shared config, linting, and type
checking pass; production builds pass; the repo has initial open-source
structure. See [CHANGELOG.md](CHANGELOG.md) for the exact list.

Explicitly **not** in this phase: image processing, real uploads, R2
storage, Cloudinary, database repositories, transformation logic, or a
complete dashboard. Do not start Phase 2 work without re-reading
ROADMAP.md first.

## Technology decisions

- **Package manager / build:** pnpm workspaces + Turborepo. Node 22+.
- **Backend runtime:** Cloudflare Workers, [Hono](https://hono.dev) for
  routing/middleware.
- **Frontend:** [Analog](https://analogjs.org) + Angular 21 — standalone
  components, signals, **zoneless** change detection
  (`provideZonelessChangeDetection()`, no `zone.js` in the runtime
  bundle), `ChangeDetectionStrategy.OnPush` everywhere, Tailwind CSS 4
  (CSS-first config, no `tailwind.config.js`).
- **Testing:** Vitest everywhere. Workers use
  `@cloudflare/vitest-pool-workers` (tests run inside `workerd`, not a
  Node mock). The dashboard's Phase 1 tests are plain Vitest against
  framework-free pure functions (env parsing, health-status mapping) —
  there is no Angular TestBed/jsdom harness yet, since nothing in Phase 1
  needs component-level rendering tests.

## UI responsibility boundaries

Four external UI libraries are used, each with a distinct job. Don't blur
these — e.g. don't reach for a Lumen SVG path by hand when an icon
component already exists, don't hand-roll a tooltip when Quartz Headless
exists to be imported for other things later:

- **Volt UI** (`@voltui/components`) — the visual component layer
  (buttons, badges, avatar, separator, sidebar layout, theming). Owns
  what things *look like*.
- **Quartz Headless** (`quartz-headless`) — unstyled behavioral
  primitives. Phase 1 uses `ViewportService` only (collapsing the sidebar
  at tablet widths). Its overlay/dialog/toast/tree/drag-drop primitives
  are unused until a later phase needs them — don't wire them up
  speculatively.
- **Angular Movement** (`angular-movement`) — animation directives.
  Phase 1 uses `moveEnter="fade"` on the app shell only, via
  `provideMovement()`. It already handles `prefers-reduced-motion`
  internally.
- **Lumen Icons** (`lumen-icons`) — every icon in the shell, as standalone
  components (`<lmn-search />`, not inline SVG or an icon font).

## Application responsibilities

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown. One-line
version: `dashboard` is the control plane, `api-worker` is the only public
write path, `delivery-worker` is the read path, `processing-worker` does
the CPU-heavy work off the request path. None of the three Workers import
a vendor storage/transformation SDK directly — that's what `providers` is
for once it has real implementations.

## Deferred work (do not implement yet)

Tracked in each placeholder package's own README, but summarized here:

- `database` — no D1 schema/migrations/repositories.
- `image-core` — no decode/resize/crop/encode pipeline.
- `providers` — identifiers only (`StorageProviderId`,
  `TransformationProviderId`); no `StorageProvider`/`TransformationProvider`
  interfaces or implementations.
- `sdk` — no HTTP client.
- `angular` — no `@angular/core` dependency, no directives/pipes yet.
- Dashboard routes other than Overview — no functional controls, just a
  static "Upcoming — Phase 4" notice.
- No deployment configuration for any app (CI builds/tests only; no
  `wrangler deploy`, no Pages/Vercel config).

## Package compatibility notes

- **Angular version is pinned to `^21.2.0`, not the latest 22.x line.**
  All four external UI libraries (`@voltui/components`, `quartz-headless`,
  `angular-movement`, `lumen-icons`) declare `peerDependencies` capped at
  `^21.x` at the time this phase was built. Bumping the dashboard to
  Angular 22 will produce peer-dependency warnings (or breakage) until
  those libraries publish 22.x-compatible releases — check their
  `peerDependencies` before upgrading.
- **`@voltui/components` is dual-distributed.** Its own repo describes it
  as "copy-and-own" (a `@voltui/cli add <component>` command that copies
  component source into your app, shadcn-style) — but the version
  published to npm *also* ships a normal `"."` package export (built via
  ng-packagr: `fesm2022` bundle + `.d.ts`). This repo uses the plain
  `import { VoltButton, provideVoltTheme } from '@voltui/components'`
  path, not the CLI, since a normal import is simpler for a monorepo and
  fully supported by the published package — confirmed by inspecting the
  installed package's `package.json` `exports` field and `.d.ts`, not by
  assumption.
- **Theming.** Volt UI ships per `data-color`/`data-style` combination as
  separate CSS files (`@voltui/components/themes/presets/<color>-<style>.css`).
  This repo imports exactly one (`glacier-sharp`) in
  `apps/dashboard/src/styles.css`. Switching the palette means changing
  that one `@import`, not writing new CSS. Dark/light mode toggling
  (`applyVoltTheme({ dark })`) works within whichever preset is imported,
  since each preset defines both a `:root` and a `.dark` block.
- **Tailwind content scanning.** No manual `content: [...]` globs exist
  (Tailwind v4 + `@tailwindcss/vite` auto-detects the Vite module graph).
  Volt's own theme CSS additionally self-registers its compiled bundle via
  `@source '../fesm2022'` so its utility classes aren't purged — this is
  inside the imported preset file, not something this repo configures.
- **Lumen Icons** ship as one standalone Angular component per icon
  (`LmnSearchIcon`, selector `lmn-search`, etc.) with `size`/`tone`/
  `variant`/`animate` inputs — import only the specific icons used, not a
  barrel of everything, to keep the bundle lean.
