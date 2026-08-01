# Changesets

Used here for **internal version planning** of `@imageryx/sdk` and `@imageryx/angular` only —
every other workspace package is listed in `config.json`'s `ignore` (apps are never published;
the remaining packages are internal-only for now). Both tracked packages are still `private: true`
in their own `package.json`, so `pnpm changeset:version` bumps versions and writes changelog
entries locally — it does not publish to npm. See README.md's "Deployment" section and
CONTRIBUTING.md for the actual `pnpm changeset` / `pnpm changeset:version` workflow.

Publishing either package to npm is a future, deliberate decision (dropping `private: true`,
choosing an npm scope/access level, wiring an `NPM_TOKEN` into CI) — not something adding a
changeset does on its own.

Full docs: https://github.com/changesets/changesets
