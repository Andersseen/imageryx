import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import { computeSha256Checksum } from "../security/checksum";
import { canonicalPresetJson, normalizePreset } from "./normalize-preset";

const textEncoder = new TextEncoder();

/**
 * A SHA-256 hex digest of the normalized, canonically-ordered preset
 * definition. Deliberately excludes provider-specific mapping output —
 * only the domain-level operations/outputFormat/quality feed the hash, so
 * switching a provider's internal parameter mapping never changes it.
 */
export async function hashPreset(input: {
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality?: number | null;
}): Promise<string> {
  const normalized = normalizePreset(input);
  const json = canonicalPresetJson(normalized);
  return computeSha256Checksum(textEncoder.encode(json));
}
