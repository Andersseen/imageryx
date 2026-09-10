import { optimizeSvgSource } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";

/**
 * `optimizeSvgSource()` (image-core) imports `svgo/browser`, not svgo's
 * default entry point (which unconditionally imports `fs/promises`/`os`/
 * `path` for its Node CLI config-loading path and cannot resolve in
 * workerd). This spec runs inside the real workerd runtime via
 * `@cloudflare/vitest-pool-workers` — not plain Node — so it's the one
 * place in the repo that actually proves the import works in the
 * environment `generate-variant.ts` runs in, not just in image-core's own
 * Node-environment unit tests.
 */
describe("optimizeSvgSource in workerd", () => {
  it("optimizes real SVG source inside the Workers runtime", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- comment --><script>alert(1)</script><rect width="10" height="10" onload="alert(2)"/></svg>`;

    const result = optimizeSvgSource(source);

    expect(result.svg).toContain('viewBox="0 0 10 10"');
    expect(result.svg).not.toContain("<script");
    expect(result.svg).not.toContain("onload");
    expect(result.optimizedSizeBytes).toBeLessThan(result.originalSizeBytes);
  });
});
