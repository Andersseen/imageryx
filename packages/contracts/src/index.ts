/**
 * @imageryx/contracts
 *
 * Shared Zod schemas and inferred TypeScript types for every Imageryx
 * domain concept (projects, folders, assets, presets, variants,
 * processing jobs, providers) plus cross-cutting shapes (pagination,
 * sorting, API errors, health checks). Organized by domain under `src/`
 * instead of one flat file — see each subfolder.
 *
 * This package must never depend on `@imageryx/image-core`,
 * `@imageryx/database`, `@imageryx/providers`, Hono, or Angular: it is the
 * innermost package in the dependency graph.
 */

export * from "./common/api-error";
export * from "./common/health";
export * from "./common/identifiers";
export * from "./common/pagination";
export * from "./common/sorting";

export * from "./providers/provider.schema";

export * from "./projects/project.contracts";
export * from "./projects/project.schema";

export * from "./folders/folder.contracts";
export * from "./folders/folder.schema";

export * from "./assets/asset-filter.schema";
export * from "./assets/asset.contracts";
export * from "./assets/asset.schema";

export * from "./presets/image-operation.schema";
export * from "./presets/preset.contracts";
export * from "./presets/preset.schema";

export * from "./variants/variant.contracts";
export * from "./variants/variant.schema";

export * from "./processing/processing-job.contracts";
export * from "./processing/processing-job.schema";

export * from "./stats/stats.schema";
