# tooling/scripts

Repository maintenance scripts, run from the monorepo root — not a
publishable package.

## Scripts

- `verify-workspace-structure.mjs` — checks that every Phase 1 app/package
  directory and required root config file exists. Run with
  `node tooling/scripts/verify-workspace-structure.mjs`. Used as an early
  CI step so a broken workspace fails fast, before install/build.
