# @imageryx/dashboard

The Imageryx dashboard: an [Analog](https://analogjs.org) + Angular 21
application (standalone components, signals, zoneless change detection,
`OnPush`).

## Phase 1 status

Only the application shell and the **Overview** page have real content. The
other six routes (`/library`, `/projects`, `/presets`, `/processing`,
`/api`, `/settings`) render a static "Upcoming — Phase 4" placeholder with
no interactive controls — see [ROADMAP.md](../../ROADMAP.md).

The Overview page polls each Worker's `/health` endpoint (and api-worker's
`/v1/info`) for real; there are no hardcoded "healthy" states.

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
