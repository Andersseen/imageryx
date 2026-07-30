import {
  MIME_TYPE_TO_EXTENSIONS,
  supportedImageExtensionSchema,
  supportedImageMimeTypeSchema,
  type SupportedImageExtension,
  type SupportedImageMimeType,
} from "@imageryx/contracts";

export interface ImageValidationResult {
  valid: boolean;
  detectedMimeType: SupportedImageMimeType | null;
  detectedExtension: SupportedImageExtension | null;
  securityWarnings: string[];
}

function bytesStartWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

const AVIF_BRANDS = new Set(["avif", "avis"]);

/** A short, best-effort structural sniff — not a full XML/SVG parser. Deliberately conservative: it only flags obvious `<svg`/`<?xml` prefixes. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const prefixLength = Math.min(bytes.length, 512);
  // Both options supplied explicitly: workerd's ambient TextDecoder type (loaded transitively by
  // any Worker app that imports this package) requires `ignoreBOM`, unlike the DOM/Node one.
  const prefix = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false })
    .decode(bytes.subarray(0, prefixLength))
    .toLowerCase();
  return prefix.includes("<svg");
}

export interface SignatureDetectionResult {
  mimeType: SupportedImageMimeType | null;
  warnings: string[];
}

/** Lightweight magic-byte detection for the formats reliably identifiable from a short prefix. */
export function detectImageSignature(
  bytes: Uint8Array,
): SignatureDetectionResult {
  if (bytesStartWith(bytes, JPEG_SIGNATURE)) {
    return { mimeType: "image/jpeg", warnings: [] };
  }
  if (bytesStartWith(bytes, PNG_SIGNATURE)) {
    return { mimeType: "image/png", warnings: [] };
  }
  if (
    bytesStartWith(bytes, GIF87_SIGNATURE) ||
    bytesStartWith(bytes, GIF89_SIGNATURE)
  ) {
    return { mimeType: "image/gif", warnings: [] };
  }
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp", warnings: [] };
  }
  if (
    asciiAt(bytes, 4, 4) === "ftyp" &&
    AVIF_BRANDS.has(asciiAt(bytes, 8, 4))
  ) {
    return { mimeType: "image/avif", warnings: [] };
  }
  if (looksLikeSvg(bytes)) {
    return {
      mimeType: "image/svg+xml",
      warnings: ["svg-detected-untrusted-content"],
    };
  }
  return { mimeType: null, warnings: [] };
}

export interface ImageValidationInput {
  claimedMimeType: string;
  claimedExtension: string;
  bytes: Uint8Array;
}

/**
 * Validates that a claimed MIME type + extension are (a) both supported,
 * (b) mutually compatible, and (c) backed by matching magic bytes. This
 * never "infers trust from extension alone" — the claim is only accepted
 * once the signature agrees with it. SVG is classified, never fully
 * sanitized: `securityWarnings` always flags it as untrusted content, even
 * when `valid` is `true`.
 */
export function validateImageAsset(
  input: ImageValidationInput,
): ImageValidationResult {
  const claimedMime = supportedImageMimeTypeSchema.safeParse(
    input.claimedMimeType,
  );
  const claimedExtension = supportedImageExtensionSchema.safeParse(
    input.claimedExtension,
  );

  if (!claimedMime.success || !claimedExtension.success) {
    return {
      valid: false,
      detectedMimeType: null,
      detectedExtension: null,
      securityWarnings: ["unsupported-claimed-type"],
    };
  }

  if (
    !MIME_TYPE_TO_EXTENSIONS[claimedMime.data].includes(claimedExtension.data)
  ) {
    return {
      valid: false,
      detectedMimeType: null,
      detectedExtension: null,
      securityWarnings: ["mime-extension-mismatch"],
    };
  }

  const detection = detectImageSignature(input.bytes);
  const warnings = [...detection.warnings];

  if (detection.mimeType === null) {
    return {
      valid: false,
      detectedMimeType: null,
      detectedExtension: null,
      securityWarnings: [...warnings, "unrecognized-signature"],
    };
  }

  if (detection.mimeType !== claimedMime.data) {
    return {
      valid: false,
      detectedMimeType: detection.mimeType,
      detectedExtension: MIME_TYPE_TO_EXTENSIONS[detection.mimeType][0] ?? null,
      securityWarnings: [...warnings, "claimed-mime-does-not-match-signature"],
    };
  }

  if (detection.mimeType === "image/svg+xml") {
    warnings.push("svg-not-fully-sanitized");
  }

  return {
    valid: true,
    detectedMimeType: detection.mimeType,
    detectedExtension: claimedExtension.data,
    securityWarnings: warnings,
  };
}
