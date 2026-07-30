import type { SupportedImageMimeType } from "@imageryx/contracts";

/**
 * Minimal byte sequences carrying a real, correct magic-byte signature for
 * each supported format — enough for `@imageryx/image-core`'s
 * `detectImageSignature`/`validateImageAsset` to recognize them, but not a
 * decodable image. Deliberately small and generated in code (no committed
 * binary fixtures).
 */
export function createImageBytesFixture(
  mimeType: SupportedImageMimeType,
): Uint8Array {
  switch (mimeType) {
    case "image/png":
      return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
    case "image/jpeg":
      return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
      ]);
    case "image/gif":
      return new TextEncoder().encode(`GIF89a${"\0".repeat(6)}`);
    case "image/webp":
      return new Uint8Array([
        ...new TextEncoder().encode("RIFF"),
        0x00,
        0x00,
        0x00,
        0x00,
        ...new TextEncoder().encode("WEBP"),
      ]);
    case "image/avif":
      return new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x1c,
        ...new TextEncoder().encode("ftyp"),
        ...new TextEncoder().encode("avif"),
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
    case "image/svg+xml":
      return new TextEncoder().encode(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      );
  }
}
