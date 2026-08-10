/**
 * @imageryx/database
 *
 * D1 schema (see `migrations/`), repository classes, and cross-table
 * persistence services. Depends only on `@imageryx/contracts` and
 * `@imageryx/image-core` — never on Hono, Angular, or a specific Worker.
 *
 * Test-only D1 setup (Miniflare-backed, migrations applied) lives behind
 * the `@imageryx/database/testing` subpath, not here, so importing this
 * barrel never pulls in Node built-ins or Miniflare.
 */

export * from "./client";
export * from "./ids";

export * from "./presets/system-presets";

export * from "./repositories/asset-activity.repository";
export * from "./repositories/api-key.repository";
export * from "./repositories/asset.repository";
export * from "./repositories/folder.repository";
export * from "./repositories/preset.repository";
export * from "./repositories/processing-job.repository";
export * from "./repositories/project.repository";
export * from "./repositories/tag.repository";
export * from "./repositories/variant.repository";

export * from "./services/asset-persistence.service";
export * from "./services/preset-persistence.service";
export * from "./services/variant-persistence.service";
