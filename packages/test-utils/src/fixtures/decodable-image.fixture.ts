import type { SupportedImageMimeType } from "@imageryx/contracts";

export interface DecodableImageFixture {
  bytes: Uint8Array;
  filename: string;
  width: number;
  height: number;
  hasAlpha: boolean | null;
}

/**
 * Unlike `createImageBytesFixture` (signature bytes only), these fixtures
 * carry a real, correctly-encoded header for their format — including
 * actual width/height/alpha fields — so `@imageryx/image-core`'s
 * `inspectImageDimensions` returns real, non-null values. They are still
 * not fully decodable/renderable images (no real pixel data beyond what
 * each format's header-level tests need), matching this repo's "no
 * committed binary fixtures" rule — everything here is generated in code.
 */
export function createDecodableImageFixture(
  mimeType: SupportedImageMimeType,
): DecodableImageFixture {
  switch (mimeType) {
    case "image/png":
      return { ...buildPng(8, 6, true), filename: "fixture.png" };
    case "image/jpeg":
      return { ...buildJpeg(8, 6), filename: "fixture.jpg" };
    case "image/gif":
      return { ...buildGif(8, 6), filename: "fixture.gif" };
    case "image/webp":
      return { ...buildWebp(8, 6, true), filename: "fixture.webp" };
    case "image/svg+xml":
      return { ...buildSvg(8, 6), filename: "fixture.svg" };
    case "image/avif":
      return { ...buildAvif(), filename: "fixture.avif" };
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(body));
  return concatBytes([length, body, crc]);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function buildPng(width: number, height: number, alpha: boolean) {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // color type: truecolor+alpha or truecolor
  const bytes = concatBytes([signature, pngChunk("IHDR", ihdr), pngChunk("IEND", new Uint8Array(0))]);
  return { bytes, width, height, hasAlpha: alpha };
}

function buildJpeg(width: number, height: number) {
  const soi = [0xff, 0xd8];
  const sof0Payload = [
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01, // number of components
    0x01,
    0x11,
    0x00,
  ];
  const sof0Length = sof0Payload.length + 2;
  const sof0 = [0xff, 0xc0, (sof0Length >> 8) & 0xff, sof0Length & 0xff, ...sof0Payload];
  const eoi = [0xff, 0xd9];
  const bytes = new Uint8Array([...soi, ...sof0, ...eoi]);
  return { bytes, width, height, hasAlpha: false };
}

function buildGif(width: number, height: number) {
  const header = new TextEncoder().encode("GIF89a");
  const screen = new Uint8Array(7);
  const view = new DataView(screen.buffer);
  view.setUint16(0, width, true);
  view.setUint16(2, height, true);
  screen[4] = 0x00; // no global color table
  const bytes = concatBytes([header, screen]);
  return { bytes, width, height, hasAlpha: null };
}

function buildWebp(width: number, height: number, alpha: boolean) {
  const riff = new TextEncoder().encode("RIFF");
  const webp = new TextEncoder().encode("WEBP");
  const vp8x = new TextEncoder().encode("VP8X");
  const payload = new Uint8Array(10);
  payload[0] = alpha ? 0x10 : 0x00;
  const w = width - 1;
  const h = height - 1;
  payload[4] = w & 0xff;
  payload[5] = (w >> 8) & 0xff;
  payload[6] = (w >> 16) & 0xff;
  payload[7] = h & 0xff;
  payload[8] = (h >> 8) & 0xff;
  payload[9] = (h >> 16) & 0xff;
  const chunkSize = new Uint8Array(4);
  new DataView(chunkSize.buffer).setUint32(0, payload.length, true);
  const fileSize = new Uint8Array(4);
  const body = concatBytes([webp, vp8x, chunkSize, payload]);
  new DataView(fileSize.buffer).setUint32(0, body.length, true);
  const bytes = concatBytes([riff, fileSize, body]);
  return { bytes, width, height, hasAlpha: alpha };
}

function buildSvg(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#e2e8f0"/></svg>`;
  return { bytes: new TextEncoder().encode(svg), width, height, hasAlpha: null };
}

/** AVIF dimension detection is unsupported in this phase (see context.md) — this fixture only needs a valid signature. */
function buildAvif() {
  const bytes = new Uint8Array([
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
  return { bytes, width: 0, height: 0, hasAlpha: null };
}
