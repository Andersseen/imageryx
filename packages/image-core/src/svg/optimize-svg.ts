import { optimize } from "svgo/browser";
import { SvgOptimizationError } from "../errors/domain-errors";

export interface OptimizeSvgOptions {
  /** Strip `<!-- comments -->`. Default true. */
  removeComments?: boolean;
  /** Strip `<metadata>` and editor-namespace cruft (Inkscape/Illustrator/Sketch). Default true. */
  removeMetadata?: boolean;
  /** Decimal precision for numeric values (path data, coordinates). Default svgo's own (3). */
  precision?: number;
}

export interface OptimizeSvgResult {
  svg: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
}

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

/**
 * Real, deterministic SVG optimization — never a regex-based minifier.
 * Parses the SVG into an AST and runs svgo's `preset-default` (structural
 * cleanup: strips comments/XML declarations/DOCTYPE/editor namespaces,
 * collapses groups, merges paths, normalizes numeric precision) plus
 * `removeScripts`, which is deliberately NOT part of `preset-default` and
 * is added unconditionally here regardless of the caller's options.
 *
 * Two properties this preserves that a naive minifier would not:
 * - `viewBox` is never touched (`removeViewBox` is not in the plugin list).
 * - `<title>` is never removed, and `<desc>` is only removed when it's
 *   empty or matches known editor-boilerplate text (svgo's own default
 *   `removeDesc` behavior) — real accessibility content in either element
 *   survives optimization.
 *
 * `removeScripts` strips `<script>` elements, every event-handler
 * attribute (`onload`, `onclick`, ...), `<foreignObject>`-embedded
 * executable HTML (`srcdoc`, `action`/`href`/`src` pointing at an
 * executable URL), and neutralizes `javascript:` URLs on `<a>` elements.
 * SVG is treated as untrusted input throughout Imageryx (see
 * mime-validation.ts / SECURITY.md) — optimization must never be a laxer
 * pass-through of executable content than that existing posture, so this
 * plugin is not one of the `options` below; it always runs.
 *
 * Imports from `svgo/browser`, not the package's default `svgo` entry
 * point: the default entry (`svgo-node.js`) unconditionally imports
 * `fs/promises`/`os`/`path` for its CLI config-loading path, which fails
 * to resolve in workerd. `svgo/browser` is svgo's own pre-bundled,
 * dependency-free build (the same one SVGOMG ships to run fully
 * client-side) and has zero Node built-in imports — verified against the
 * installed package before relying on it.
 */
export function optimizeSvgSource(
  source: string,
  options: OptimizeSvgOptions = {},
): OptimizeSvgResult {
  const { removeComments = true, removeMetadata = true, precision } = options;

  const overrides: Record<string, false> = {};
  if (!removeComments) overrides.removeComments = false;
  if (!removeMetadata) overrides.removeMetadata = false;

  let result: { data: string };
  try {
    result = optimize(source, {
      multipass: true,
      plugins: [
        {
          name: "preset-default",
          params: {
            ...(precision !== undefined ? { floatPrecision: precision } : {}),
            ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
          },
        },
        "removeScripts",
      ],
    });
  } catch (error) {
    throw new SvgOptimizationError(
      `failed to optimize SVG source: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return {
    svg: result.data,
    originalSizeBytes: byteLength(source),
    optimizedSizeBytes: byteLength(result.data),
  };
}
