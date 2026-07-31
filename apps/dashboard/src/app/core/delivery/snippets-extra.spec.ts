import { describe, expect, it } from "vitest";
import {
  buildCurlUploadSnippet,
  buildResponsiveHtmlSnippet,
  buildSdkSnippet,
} from "./snippets-extra";

describe("buildResponsiveHtmlSnippet", () => {
  it("includes src, srcset, sizes and alt", () => {
    const snippet = buildResponsiveHtmlSnippet({
      originalUrl: "https://cdn.test/p/assets/hero",
      srcset:
        "https://cdn.test/p/assets/hero/p/sm 480w, https://cdn.test/p/assets/hero/p/lg 1920w",
      sizes: "100vw",
      alt: "Hero image",
    });
    expect(snippet).toContain('src="https://cdn.test/p/assets/hero"');
    expect(snippet).toContain("srcset=");
    expect(snippet).toContain('sizes="100vw"');
    expect(snippet).toContain('alt="Hero image"');
    expect(snippet).toContain('loading="lazy"');
  });

  it("omits width/height when not given, rather than emitting empty attributes", () => {
    const snippet = buildResponsiveHtmlSnippet({
      originalUrl: "https://cdn.test/x",
      srcset: "https://cdn.test/x 1w",
      sizes: "100vw",
      alt: "x",
    });
    expect(snippet).not.toContain("width=");
    expect(snippet).not.toContain("height=");
  });

  it("includes width/height when given", () => {
    const snippet = buildResponsiveHtmlSnippet({
      originalUrl: "https://cdn.test/x",
      srcset: "https://cdn.test/x 1w",
      sizes: "100vw",
      alt: "x",
      width: 1920,
      height: 1080,
    });
    expect(snippet).toContain('width="1920"');
    expect(snippet).toContain('height="1080"');
  });

  it("escapes an alt text containing HTML-significant characters", () => {
    const snippet = buildResponsiveHtmlSnippet({
      originalUrl: "https://cdn.test/x",
      srcset: "https://cdn.test/x 1w",
      sizes: "100vw",
      alt: `"><script>alert(1)</script>`,
    });
    expect(snippet).not.toContain("<script>");
    expect(snippet).toContain("&lt;script&gt;");
  });

  it("adds a class attribute only when requested", () => {
    expect(
      buildResponsiveHtmlSnippet({
        originalUrl: "https://cdn.test/x",
        srcset: "https://cdn.test/x 1w",
        sizes: "100vw",
        alt: "x",
        cssClass: "hero-image",
      }),
    ).toContain('class="hero-image"');
    expect(
      buildResponsiveHtmlSnippet({
        originalUrl: "https://cdn.test/x",
        srcset: "https://cdn.test/x 1w",
        sizes: "100vw",
        alt: "x",
      }),
    ).not.toContain("class=");
  });
});

describe("buildSdkSnippet", () => {
  it("mirrors the SDK's real positional presetUrl signature", () => {
    const snippet = buildSdkSnippet({
      project: "angular-lab",
      asset: "courses/signals/hero",
      preset: "hero",
    });
    expect(snippet).toBe(
      'const url = imageryx.delivery.presetUrl("angular-lab", "courses/signals/hero", "hero");',
    );
  });

  it("uses originalUrl when no preset is selected", () => {
    const snippet = buildSdkSnippet({ project: "p", asset: "a" });
    expect(snippet).toBe(
      'const url = imageryx.delivery.originalUrl("p", "a");',
    );
  });

  it("produces syntactically valid arguments even for values containing quotes", () => {
    const snippet = buildSdkSnippet({
      project: 'p"x',
      asset: "a",
      preset: "hero",
    });
    expect(() =>
      JSON.parse(snippet.match(/"p\\"x"|"[^"]*"/)?.[0] ?? ""),
    ).not.toThrow();
  });
});

describe("buildCurlUploadSnippet", () => {
  it("targets the real upload route with a Bearer header and multipart fields", () => {
    const snippet = buildCurlUploadSnippet({
      apiUrl: "http://localhost:8787",
      projectId: "proj-1",
    });
    expect(snippet).toContain("http://localhost:8787/v1/assets/upload");
    expect(snippet).toContain("Authorization: Bearer");
    expect(snippet).toContain("projectId=proj-1");
    expect(snippet).toContain("file=@");
  });
});
