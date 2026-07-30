import type { SupportedImageMimeType } from "@imageryx/contracts";

export interface ImageDimensions {
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  warnings: string[];
}

const NONE: ImageDimensions = {
  width: null,
  height: null,
  hasAlpha: null,
  warnings: [],
};

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 4) return null;
  return (
    ((bytes[offset] as number) << 24) |
    ((bytes[offset + 1] as number) << 16) |
    ((bytes[offset + 2] as number) << 8) |
    (bytes[offset + 3] as number)
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return (bytes[offset] as number) | ((bytes[offset + 1] as number) << 8);
}

/** PNG: fixed-layout IHDR chunk always starts right after the 8-byte signature. */
function inspectPng(bytes: Uint8Array): ImageDimensions {
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width === null || height === null) {
    return { ...NONE, warnings: ["png-ihdr-truncated"] };
  }
  const colorType = bytes.length > 25 ? bytes[25] : undefined;
  // Color type 4 (grayscale+alpha) and 6 (truecolor+alpha) always carry an alpha channel.
  // Palette images (type 3) *may* carry alpha via a separate tRNS chunk, which this
  // lightweight scan does not look for — documented simplification, not a bug.
  const hasAlpha =
    colorType === undefined ? null : colorType === 4 || colorType === 6;
  return { width: width > 0 ? width : null, height: height > 0 ? height : null, hasAlpha, warnings: [] };
}

/** GIF: fixed-offset logical screen descriptor, always little-endian. Per-frame transparency (Graphic Control Extension) is not scanned — reported as unknown, not false. */
function inspectGif(bytes: Uint8Array): ImageDimensions {
  const width = readUint16LE(bytes, 6);
  const height = readUint16LE(bytes, 8);
  if (width === null || height === null) {
    return { ...NONE, warnings: ["gif-header-truncated"] };
  }
  return {
    width: width > 0 ? width : null,
    height: height > 0 ? height : null,
    hasAlpha: null,
    warnings: ["gif-alpha-not-detected"],
  };
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_STANDALONE_MARKERS = new Set([0xd8, 0xd9, 0x01]);

/** JPEG: scans markers for the first Start Of Frame segment (JFIF/EXIF headers vary in length, so a fixed offset never works). JPEG has no alpha channel. */
function inspectJpeg(bytes: Uint8Array): ImageDimensions {
  let offset = 2; // past the 0xFFD8 SOI marker
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] as number;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_STANDALONE_MARKERS.has(marker) || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = readUint16BE(bytes, offset + 2);
    if (segmentLength === null) break;

    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      if (width !== null && height !== null) {
        return {
          width: width > 0 ? width : null,
          height: height > 0 ? height : null,
          hasAlpha: false,
          warnings: [],
        };
      }
      break;
    }

    offset += 2 + segmentLength;
  }
  return { ...NONE, warnings: ["jpeg-sof-marker-not-found"] };
}

/**
 * WebP: layout depends on the sub-chunk kind following the "WEBP" fourCC.
 * VP8X (extended) carries an explicit alpha flag; VP8L (lossless) packs
 * dimensions and an alpha flag into one bit-packed 32-bit field; VP8
 * (lossy, no extended header) never carries alpha on its own.
 */
function inspectWebp(bytes: Uint8Array): ImageDimensions {
  if (bytes.length < 21) return { ...NONE, warnings: ["webp-header-truncated"] };
  const fourCc = String.fromCharCode(
    bytes[12] as number,
    bytes[13] as number,
    bytes[14] as number,
    bytes[15] as number,
  );
  const payloadOffset = 20;

  if (fourCc === "VP8X") {
    if (bytes.length < payloadOffset + 10) {
      return { ...NONE, warnings: ["webp-header-truncated"] };
    }
    const flags = bytes[payloadOffset] as number;
    const hasAlpha = (flags & 0x10) !== 0;
    const width =
      ((bytes[payloadOffset + 4] as number) |
        ((bytes[payloadOffset + 5] as number) << 8) |
        ((bytes[payloadOffset + 6] as number) << 16)) +
      1;
    const height =
      ((bytes[payloadOffset + 7] as number) |
        ((bytes[payloadOffset + 8] as number) << 8) |
        ((bytes[payloadOffset + 9] as number) << 16)) +
      1;
    return { width, height, hasAlpha, warnings: [] };
  }

  if (fourCc === "VP8 ") {
    if (bytes.length < payloadOffset + 10) {
      return { ...NONE, warnings: ["webp-header-truncated"] };
    }
    const width = ((bytes[payloadOffset + 6] as number) | ((bytes[payloadOffset + 7] as number) << 8)) & 0x3fff;
    const height = ((bytes[payloadOffset + 8] as number) | ((bytes[payloadOffset + 9] as number) << 8)) & 0x3fff;
    return { width: width || null, height: height || null, hasAlpha: false, warnings: [] };
  }

  if (fourCc === "VP8L") {
    if (bytes.length < payloadOffset + 5) {
      return { ...NONE, warnings: ["webp-header-truncated"] };
    }
    const b0 = bytes[payloadOffset + 1] as number;
    const b1 = bytes[payloadOffset + 2] as number;
    const b2 = bytes[payloadOffset + 3] as number;
    const b3 = bytes[payloadOffset + 4] as number;
    const packed = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    const hasAlpha = ((packed >>> 28) & 0x1) === 1;
    return { width, height, hasAlpha, warnings: [] };
  }

  return { ...NONE, warnings: ["webp-chunk-kind-not-recognized"] };
}

const SVG_DIMENSION_WINDOW = 4096;

/**
 * SVG: no fixed pixel dimensions unless the root element declares
 * `width`/`height` (rejecting percentages, which have no absolute pixel
 * value) or a `viewBox`. `viewBox` wins when explicit width/height are
 * absent or non-numeric — this mirrors how a browser sizes an unstyled SVG.
 */
function inspectSvg(bytes: Uint8Array): ImageDimensions {
  const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(
    bytes.subarray(0, Math.min(bytes.length, SVG_DIMENSION_WINDOW)),
  );
  const openTagMatch = /<svg\b[^>]*>/i.exec(text);
  if (!openTagMatch) return { ...NONE, warnings: ["svg-root-element-not-found"] };
  const openTag = openTagMatch[0];

  const widthMatch = /\bwidth\s*=\s*"([\d.]+)(?:px)?"/i.exec(openTag);
  const heightMatch = /\bheight\s*=\s*"([\d.]+)(?:px)?"/i.exec(openTag);
  const viewBoxMatch = /\bviewBox\s*=\s*"\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(
    openTag,
  );

  let width = widthMatch ? Number(widthMatch[1]) : null;
  let height = heightMatch ? Number(heightMatch[1]) : null;

  if ((width === null || height === null) && viewBoxMatch) {
    width ??= Number(viewBoxMatch[1]);
    height ??= Number(viewBoxMatch[2]);
  }

  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { ...NONE, warnings: ["svg-dimensions-not-declared"] };
  }
  return { width: Math.round(width), height: Math.round(height), hasAlpha: null, warnings: [] };
}

/**
 * Best-effort, pure-JavaScript dimension/alpha inspection — no decode
 * pipeline, only fixed-layout header parsing per format. Never invents a
 * value: an unparseable or truncated header returns `null` fields plus a
 * warning rather than a guess. AVIF has no implementation here (see
 * context.md) — its container (ISOBMFF/HEIF-derived) needs a real box
 * parser this phase does not include; it always reports unknown dimensions.
 */
export function inspectImageDimensions(
  mimeType: SupportedImageMimeType,
  bytes: Uint8Array,
): ImageDimensions {
  switch (mimeType) {
    case "image/png":
      return inspectPng(bytes);
    case "image/jpeg":
      return inspectJpeg(bytes);
    case "image/gif":
      return inspectGif(bytes);
    case "image/webp":
      return inspectWebp(bytes);
    case "image/svg+xml":
      return inspectSvg(bytes);
    case "image/avif":
      return { ...NONE, warnings: ["avif-dimension-detection-not-supported"] };
  }
}
