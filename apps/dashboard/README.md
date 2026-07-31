# @imageryx/dashboard

The Imageryx dashboard: an [Analog](https://analogjs.org) + Angular 21
application (standalone components, signals, zoneless change detection,
`OnPush`).

## Phase 4B status

Every route is real. **Overview** polls each Worker's `/health` endpoint
(and api-worker's `/v1/info`) live — no hardcoded "healthy" states.
**`/library`** and **`/projects`** browse/manage assets and projects in
bulk; **`/library/:assetId`** is the full per-asset workspace (preview,
variants with scoped polling, delivery snippets, signed downloads, activity,
settings). **`/presets`** (+ `/new`, `/:presetId`) is a real system/custom
preset list and editor with a live provider-compatibility check.
**`/processing`** (+ `/:jobId`) lists and polls real processing jobs, retry
and cancel included. **`/api`** is a live developer reference (health,
masked API key, generated code examples). **`/settings`** mirrors the same
live configuration, read-only. See [ROADMAP.md](../../ROADMAP.md) and
context.md's "Phase 4B decisions and limitations" for what's still open.

## UI libraries

| Library                                                                                 | Role                                                                                |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Volt UI](https://volt-ui.andersseen.dev) (`@voltui/components`)                        | Sidebar layout, buttons, badges, avatar, separator, tooltip, theming                |
| [Quartz Headless](https://quartz-headless.pages.dev) (`quartz-headless`)                | `ViewportService` — collapses the sidebar at tablet widths                          |
| [Angular Movement](https://github.com/Andersseen/angular-movement) (`angular-movement`) | `moveEnter` fade-in on the app shell (respects `prefers-reduced-motion` internally) |
| [Lumen Icons](https://lumen-icons.dev) (`lumen-icons`)                                  | All icons in the sidebar and topbar                                                 |

See [context.md](../../context.md) for compatibility notes on each package.

## Local development

```bash
pnpm --filter @imageryx/dashboard dev   # http://localhost:5173
```

Requires `api-worker`, `delivery-worker`, and `processing-worker` running
locally (`pnpm dev` from the repo root starts all of them together) for the
Overview page's health cards to show anything other than errors.

## Environment

See `.env.example`. Only `VITE_`-prefixed vars are readable by client code
(Vite convention); parsing happens once in
`src/app/core/env/dashboard-env.ts`.
