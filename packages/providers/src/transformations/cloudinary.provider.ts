import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import {
  InvalidImagePathError,
  ProviderUnavailableError,
  UnsupportedOperationError,
  type TransformationProviderCapabilities,
} from "@imageryx/image-core";
import type {
  ProviderSupportResult,
  TransformationInput,
  TransformationProvider,
  TransformationResult,
} from "./transformation-provider";

/**
 * Parameter names and ranges below follow Cloudinary's publicly documented
 * transformation reference, not a live account (Phase 2 makes no real
 * Cloudinary calls). Where the docs leave a numeric range ambiguous
 * (`blur`/`sharpen` effect strength), a reasonable linear mapping is
 * chosen and called out below — worth re-verifying against a real account
 * before this provider's `transform()` is wired up to real requests.
 */
export interface CloudinaryTransformationOptions {
  crop?: "fill" | "fit" | "limit" | "pad" | "thumb" | "crop";
  width?: number;
  height?: number;
  /** Only set for a manual (x, y, width, height) crop — `c_crop`'s pixel offset, not a resize gravity anchor. */
  x?: number;
  y?: number;
  gravity?:
    | "center"
    | "north"
    | "south"
    | "east"
    | "west"
    | "north_west"
    | "north_east"
    | "south_west"
    | "south_east";
  quality?: number;
  format?: OutputImageFormat extends infer F
    ? F extends "auto"
      ? "auto"
      : F
    : never;
  angle?: 90 | 180 | 270;
  effects: string[];
  background?: string;
  flags: string[];
}

export interface CloudinaryProviderOptions {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  /** Injected fetch for tests; defaults to the global fetch at runtime. */
  fetch?: typeof fetch;
}

export const CLOUDINARY_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "cloudinary",
  supportedOperations: [
    "resize",
    "crop",
    "rotate",
    "flip",
    "format",
    "quality",
    "background",
    "blur",
    "sharpen",
    "grayscale",
    "metadata",
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: true,
  supportsRemoteSources: true,
  supportsDynamicDelivery: true,
};

const CROP_FIT_MAP: Record<string, CloudinaryTransformationOptions["crop"]> = {
  cover: "fill",
  contain: "fit",
  "scale-down": "limit",
  crop: "thumb",
  pad: "pad",
};

const GRAVITY_MAP: Record<string, CloudinaryTransformationOptions["gravity"]> =
  {
    center: "center",
    top: "north",
    bottom: "south",
    left: "west",
    right: "east",
    "top-left": "north_west",
    "top-right": "north_east",
    "bottom-left": "south_west",
    "bottom-right": "south_east",
  };

const FORMAT_MAP: Record<Exclude<OutputImageFormat, "auto">, string> = {
  avif: "avif",
  webp: "webp",
  jpeg: "jpg",
  png: "png",
};

/** Domain 0-100 -> Cloudinary's documented e_blur strength range (1-2000). */
export function mapCloudinaryBlurValue(domainValue: number): number {
  const clamped = Math.min(100, Math.max(0, domainValue));
  return Math.round(1 + (clamped / 100) * 1999);
}

/** Domain 0-100 -> Cloudinary e_sharpen strength, passed through 1:1 as a percentage-style amount. */
export function mapCloudinarySharpenValue(domainValue: number): number {
  return Math.round(Math.min(100, Math.max(0, domainValue)));
}

function assertSupported(operations: readonly ImageOperation[]): void {
  const unsupported = operations
    .map((op) => op.type)
    .filter(
      (type) => !CLOUDINARY_CAPABILITIES.supportedOperations.includes(type),
    );
  if (unsupported.length > 0) {
    throw new UnsupportedOperationError(
      `Cloudinary mapping does not support: ${unsupported.join(", ")}`,
      unsupported,
    );
  }
}

/** Pure mapping from domain operations to Cloudinary transformation options — never makes a request. */
export function mapOperationsToCloudinaryOptions(
  operations: readonly ImageOperation[],
  outputFormat: OutputImageFormat,
  quality: number | null,
): CloudinaryTransformationOptions {
  assertSupported(operations);

  const options: CloudinaryTransformationOptions = { effects: [], flags: [] };

  for (const operation of operations) {
    switch (operation.type) {
      case "resize": {
        if (operation.width !== undefined) options.width = operation.width;
        if (operation.height !== undefined) options.height = operation.height;
        options.crop = CROP_FIT_MAP[operation.fit];
        if (operation.position)
          options.gravity = GRAVITY_MAP[operation.position];
        break;
      }
      case "crop": {
        // A manual pixel-rectangle crop maps to Cloudinary's own `c_crop` mode (distinct from the
        // resize-fit `c_thumb` mapping used for our `resize` operation's `fit: 'crop'` above).
        options.crop = "crop";
        options.width = operation.width;
        options.height = operation.height;
        options.x = operation.x;
        options.y = operation.y;
        break;
      }
      case "rotate": {
        if (operation.degrees !== 0) options.angle = operation.degrees;
        break;
      }
      case "flip": {
        if (operation.horizontal) options.effects.push("hflip");
        if (operation.vertical) options.effects.push("vflip");
        break;
      }
      case "format": {
        options.format = (
          operation.format === "auto" ? "auto" : FORMAT_MAP[operation.format]
        ) as CloudinaryTransformationOptions["format"];
        break;
      }
      case "quality": {
        options.quality = operation.value;
        break;
      }
      case "background": {
        options.background =
          operation.color === "transparent"
            ? "transparent"
            : `rgb:${operation.color.replace("#", "")}`;
        break;
      }
      case "blur": {
        options.effects.push(`blur:${mapCloudinaryBlurValue(operation.value)}`);
        break;
      }
      case "sharpen": {
        options.effects.push(
          `sharpen:${mapCloudinarySharpenValue(operation.value)}`,
        );
        break;
      }
      case "grayscale": {
        options.effects.push("grayscale");
        break;
      }
      case "metadata": {
        if (operation.mode === "strip-location") {
          throw new UnsupportedOperationError(
            "Cloudinary has no documented location-only metadata strip flag",
            ["metadata"],
          );
        }
        if (operation.mode === "strip") options.flags.push("strip_profile");
        break;
      }
      default:
        break;
    }
  }

  if (options.format === undefined) {
    options.format = (
      outputFormat === "auto" ? "auto" : FORMAT_MAP[outputFormat]
    ) as CloudinaryTransformationOptions["format"];
  }
  if (quality !== null && options.quality === undefined) {
    options.quality = quality;
  }

  return options;
}

/** No user-controlled raw paths — built only from opaque, system-generated IDs. */
export function buildCloudinaryPublicId(
  assetId: string,
  presetHash: string,
): string {
  if (
    !/^[A-Za-z0-9_-]+$/.test(assetId) ||
    !/^[A-Za-z0-9_-]+$/.test(presetHash)
  ) {
    throw new InvalidImagePathError(
      "assetId and presetHash must be opaque identifiers to build a Cloudinary public_id",
    );
  }
  return `imageryx/${assetId}/${presetHash}`;
}

export interface CloudinarySignatureInput {
  params: Readonly<Record<string, string | number>>;
  apiSecret: string;
}

/**
 * Cloudinary's classic signing algorithm: sort every param (excluding
 * `file`, `cloud_name`, `resource_type`, `api_key`, `signature`) by key,
 * join as `key=value&key=value...`, append the API secret directly (not
 * HMAC — a plain concatenated SHA-1), and hex-encode the digest. This is
 * pure local computation, not a network call — `apiSecret` is only ever
 * accepted as a caller-supplied argument, never read from a hardcoded
 * value or logged.
 */
export function buildCloudinarySignatureBase(
  params: Readonly<Record<string, string | number>>,
): string {
  const excluded = new Set([
    "file",
    "cloud_name",
    "resource_type",
    "api_key",
    "signature",
  ]);
  const sortedKeys = Object.keys(params)
    .filter((key) => !excluded.has(key))
    .sort();
  return sortedKeys.map((key) => `${key}=${params[key]}`).join("&");
}

export async function signCloudinaryParams(
  input: CloudinarySignatureInput,
): Promise<string> {
  const base = buildCloudinarySignatureBase(input.params) + input.apiSecret;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(base),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildCloudinaryTransformationString(
  options: CloudinaryTransformationOptions,
): string {
  const parts: string[] = [];
  if (options.crop) parts.push(`c_${options.crop}`);
  if (options.width !== undefined) parts.push(`w_${options.width}`);
  if (options.height !== undefined) parts.push(`h_${options.height}`);
  if (options.x !== undefined) parts.push(`x_${options.x}`);
  if (options.y !== undefined) parts.push(`y_${options.y}`);
  if (options.gravity) parts.push(`g_${options.gravity}`);
  if (options.quality !== undefined) {
    parts.push(`q_${options.quality}`);
  }
  if (options.format && options.format !== "auto") {
    parts.push(`f_${options.format}`);
  }
  if (options.angle) parts.push(`a_${options.angle}`);
  for (const effect of options.effects) parts.push(`e_${effect}`);
  if (options.background) {
    parts.push(
      options.background === "transparent"
        ? "b_transparent"
        : `b_${options.background}`,
    );
  }
  for (const flag of options.flags) parts.push(`fl_${flag}`);
  return parts.join(",");
}

function mimeTypeFromFormat(format: OutputImageFormat): string {
  switch (format) {
    case "avif":
      return "image/avif";
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "auto":
    default:
      return "image/jpeg";
  }
}

/**
 * Real Cloudinary transformation provider. Uploads the source bytes to
 * Cloudinary, applies the mapped transformation eagerly, fetches the
 * resulting bytes, and returns them for persistence in Imageryx/R2.
 *
 * `fetch` is injectable so tests can run without credentials or network.
 */
export class CloudinaryProvider implements TransformationProvider {
  readonly name = "cloudinary" as const;
  readonly capabilities = CLOUDINARY_CAPABILITIES;
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudinaryProviderOptions = {}) {
    this.cloudName = options.cloudName ?? "";
    this.apiKey = options.apiKey ?? "";
    this.apiSecret = options.apiSecret ?? "";
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private assertCredentials(): void {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new ProviderUnavailableError(
        "Cloudinary provider requires cloudName, apiKey, and apiSecret",
      );
    }
  }

  supports(
    operations: readonly ImageOperation[],
    outputFormat: OutputImageFormat,
  ): ProviderSupportResult {
    const unsupportedOperations = operations
      .map((op) => op.type)
      .filter((type) => !this.capabilities.supportedOperations.includes(type));
    const unsupportedOutputFormat =
      !this.capabilities.supportedOutputFormats.includes(outputFormat);
    return {
      supported: unsupportedOperations.length === 0 && !unsupportedOutputFormat,
      unsupportedOperations,
      unsupportedOutputFormat,
    };
  }

  async transform(input: TransformationInput): Promise<TransformationResult> {
    this.assertCredentials();

    if (!input.sourceBytes || input.sourceBytes.byteLength === 0) {
      throw new ProviderUnavailableError(
        "Cloudinary transform requires source bytes",
      );
    }

    const options = mapOperationsToCloudinaryOptions(
      input.operations,
      input.outputFormat,
      input.quality,
    );
    const transformationString = buildCloudinaryTransformationString(options);
    const publicId = buildCloudinaryPublicId(input.assetId, input.presetHash);
    const timestamp = Math.floor(Date.now() / 1000);

    const uploadParams: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
      api_key: this.apiKey,
      eager: transformationString || "",
    };
    const signature = await signCloudinaryParams({
      params: uploadParams,
      apiSecret: this.apiSecret,
    });

    const form = new FormData();
    const sourceBuffer = input.sourceBytes.buffer.slice(
      input.sourceBytes.byteOffset,
      input.sourceBytes.byteOffset + input.sourceBytes.byteLength,
    ) as ArrayBuffer;
    form.append(
      "file",
      new Blob([sourceBuffer], { type: input.sourceMimeType }),
      "source",
    );
    form.append("public_id", publicId);
    form.append("timestamp", String(timestamp));
    form.append("api_key", this.apiKey);
    form.append("signature", signature);
    if (transformationString) {
      form.append("eager", transformationString);
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
    const uploadResponse = await this.fetchImpl(uploadUrl, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      throw new ProviderUnavailableError(
        `Cloudinary upload failed (${uploadResponse.status})`,
      );
    }

    let uploadJson: unknown;
    try {
      uploadJson = await uploadResponse.json();
    } catch {
      throw new ProviderUnavailableError(
        "Cloudinary upload returned invalid JSON",
      );
    }

    const eagerUrl = extractEagerUrl(uploadJson, transformationString);
    if (!eagerUrl) {
      throw new ProviderUnavailableError(
        "Cloudinary upload did not return an eager transformation URL",
      );
    }

    const variantResponse = await this.fetchImpl(eagerUrl);
    if (!variantResponse.ok) {
      throw new ProviderUnavailableError(
        `Cloudinary eager fetch failed (${variantResponse.status})`,
      );
    }

    const bytes = new Uint8Array(await variantResponse.arrayBuffer());
    const mimeType =
      variantResponse.headers.get("content-type") ??
      mimeTypeFromFormat(input.outputFormat);
    const checksumBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(checksumBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return {
      providerOperationId: `cloudinary-${publicId}`,
      mimeType,
      width: options.width ?? input.sourceWidth,
      height: options.height ?? input.sourceHeight,
      sizeBytes: bytes.byteLength,
      checksum,
      deliveryUrl: null,
      storageKey: null,
      bytes,
      simulated: false,
    };
  }
}

function extractEagerUrl(
  json: unknown,
  _transformationString: string,
): string | null {
  if (!json || typeof json !== "object") return null;
  const eager = (json as Record<string, unknown>).eager;
  if (!Array.isArray(eager)) return null;
  for (const entry of eager) {
    if (!entry || typeof entry !== "object") continue;
    const url = (entry as Record<string, unknown>).secure_url;
    if (typeof url === "string") return url;
  }
  return null;
}
