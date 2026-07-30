import { describe, expect, it } from "vitest";
import { DeliveryResource } from "./delivery";
import { SnippetsResource } from "./snippets";

describe("SnippetsResource", () => {
  const delivery = new DeliveryResource({ deliveryUrl: "http://localhost:8788" });
  const snippets = new SnippetsResource(delivery);

  it("generates an HTML <img> snippet with dimensions and lazy loading", () => {
    const html = snippets.html({
      project: "angular-lab",
      asset: "courses/signals/hero",
      preset: "hero",
      alt: "Angular Signals course",
      width: 1920,
      height: 1080,
    });
    expect(html).toContain('src="http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero"');
    expect(html).toContain('alt="Angular Signals course"');
    expect(html).toContain('width="1920" height="1080"');
    expect(html).toContain('loading="lazy"');
  });

  it("generates an Angular <imgyx-image> snippet", () => {
    const angular = snippets.angular({
      project: "angular-lab",
      asset: "courses/signals/hero",
      preset: "hero",
      alt: "Angular Signals course",
      width: 1920,
      height: 1080,
    });
    expect(angular).toContain("<imgyx-image");
    expect(angular).toContain('project="angular-lab"');
    expect(angular).toContain('asset="courses/signals/hero"');
    expect(angular).toContain('preset="hero"');
    expect(angular).toContain("[width]=\"1920\"");
    expect(angular).toContain("[height]=\"1080\"");
  });

  it("escapes special characters in alt text", () => {
    const html = snippets.html({
      project: "p",
      asset: "a",
      alt: `A "quoted" & <tagged> alt`,
    });
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;tagged&gt;");
  });
});
