/**
 * Every domain error carries a stable, machine-readable `code` (safe to
 * forward in an `ApiError.code`) and never wraps or exposes secrets, raw
 * provider responses, or stack traces from elsewhere — callers that need
 * to log the underlying cause should do so separately, server-side only.
 */
export abstract class ImageryxDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidImagePathError extends ImageryxDomainError {
  readonly code = "invalid_image_path";
}

export class UnsupportedImageFormatError extends ImageryxDomainError {
  readonly code = "unsupported_image_format";
}

export class InvalidPresetError extends ImageryxDomainError {
  readonly code = "invalid_preset";
}

export class UnsupportedOperationError extends ImageryxDomainError {
  readonly code = "unsupported_operation";

  constructor(
    message: string,
    readonly unsupportedOperations: readonly string[] = [],
  ) {
    super(message);
  }
}

export class DuplicateVariantError extends ImageryxDomainError {
  readonly code = "duplicate_variant";
}

export class ProviderUnavailableError extends ImageryxDomainError {
  readonly code = "provider_unavailable";
}

export class StorageObjectNotFoundError extends ImageryxDomainError {
  readonly code = "storage_object_not_found";
}

export class InvalidStateTransitionError extends ImageryxDomainError {
  readonly code = "invalid_state_transition";
}
