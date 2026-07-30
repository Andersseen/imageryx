/**
 * @imageryx/image-core
 *
 * Provider-independent image domain services: filename/path normalization,
 * MIME/signature validation, checksums, preset normalization and hashing,
 * transformation-chain validation, provider selection, and job/variant
 * state machines. Depends only on `@imageryx/contracts` — never on
 * `@imageryx/database`, Hono, Angular, Cloudflare, or Cloudinary.
 */

export * from "./errors/domain-errors";

export * from "./assets/aspect-ratio";
export * from "./assets/normalize-filename";

export * from "./paths/asset-path";
export * from "./paths/delivery-path";
export * from "./paths/logical-path";
export * from "./paths/storage-key";

export * from "./security/base64";
export * from "./security/checksum";
export * from "./security/constant-time";
export * from "./security/mime-validation";
export * from "./security/signed-token";

export * from "./metadata/inspect-dimensions";

export * from "./rendering/placeholder";
export * from "./rendering/simulated-variant-svg";

export * from "./presets/hash-preset";
export * from "./presets/normalize-preset";
export * from "./presets/validate-transformation";
export * from "./presets/variant-naming";

export * from "./processing/job-idempotency";
export * from "./processing/job-transitions";
export * from "./processing/variant-transitions";

export * from "./providers/capabilities";
export * from "./providers/provider-selection";
