import { ImageryxDomainError } from "@imageryx/image-core";
import { MockTransformationFailureError } from "@imageryx/providers";

/** The referenced project/asset/preset/variant no longer exists (or never did) — retrying will never resolve this. */
export class MissingResourceError extends Error {}

/** The job targets a soft-deleted asset — never retried, matches the spec's "deleted asset" non-retry rule. */
export class DeletedAssetError extends Error {}

/** Job types outside Phase 3's required vertical slice (extract-placeholder as a standalone step, strip-metadata, copy-provider-result, delete-object, batch-operation) — see context.md for what Phase 3 implements. */
export class UnsupportedJobTypeError extends Error {}

export interface ClassifiedProcessingError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Every domain error this Worker can throw is validation-shaped or
 * permanent by construction (bad preset, unsupported operation, missing
 * storage object, a provider that's never implemented real network calls
 * in this phase) — none represent a transient condition, so they are
 * always non-retryable. Only a genuinely unrecognized error (a real I/O
 * hiccup, an unexpected bug) is assumed transient and retried, per
 * context.md's retry/no-retry table.
 */
export function classifyProcessingError(error: unknown): ClassifiedProcessingError {
  if (error instanceof MissingResourceError) {
    return { code: "missing_resource", message: error.message, retryable: false };
  }
  if (error instanceof DeletedAssetError) {
    return { code: "deleted_asset", message: error.message, retryable: false };
  }
  if (error instanceof UnsupportedJobTypeError) {
    return { code: "unsupported_job_type", message: error.message, retryable: false };
  }
  if (error instanceof MockTransformationFailureError) {
    return {
      code: "simulated_transformation_failure",
      message: "The mock transformation provider simulated a failure for this asset.",
      retryable: false,
    };
  }
  if (error instanceof ImageryxDomainError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: "processing_failed",
    message: "Processing failed due to a transient error.",
    retryable: true,
  };
}
