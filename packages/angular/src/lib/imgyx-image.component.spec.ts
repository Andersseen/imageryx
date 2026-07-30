import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImgyxImage } from "./imgyx-image.component";

describe("ImgyxImage", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImgyxImage],
      providers: [provideZonelessChangeDetection()],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  async function render(inputs: Partial<{
    project: string;
    asset: string;
    preset: string;
    alt: string;
    width: number;
    height: number;
    loading: "lazy" | "eager";
    fallback: string;
    deliveryBaseUrl: string;
  }>) {
    const fixture = TestBed.createComponent(ImgyxImage);
    fixture.componentRef.setInput("project", inputs.project ?? "angular-lab");
    fixture.componentRef.setInput("asset", inputs.asset ?? "courses/signals/hero");
    fixture.componentRef.setInput("alt", inputs.alt ?? "Angular Signals course");
    fixture.componentRef.setInput("deliveryBaseUrl", inputs.deliveryBaseUrl ?? "http://localhost:8788");
    if (inputs.preset !== undefined) fixture.componentRef.setInput("preset", inputs.preset);
    if (inputs.width !== undefined) fixture.componentRef.setInput("width", inputs.width);
    if (inputs.height !== undefined) fixture.componentRef.setInput("height", inputs.height);
    if (inputs.loading !== undefined) fixture.componentRef.setInput("loading", inputs.loading);
    if (inputs.fallback !== undefined) fixture.componentRef.setInput("fallback", inputs.fallback);
    await fixture.whenStable();
    return fixture;
  }

  it("renders the original delivery URL when no preset is given", async () => {
    const fixture = await render({});
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.src).toBe("http://localhost:8788/angular-lab/assets/courses/signals/hero");
  });

  it("renders the preset delivery URL when a preset is given", async () => {
    const fixture = await render({ preset: "hero" });
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.src).toBe("http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero");
  });

  it("renders the given alt text", async () => {
    const fixture = await render({ alt: "A course hero image" });
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.alt).toBe("A course hero image");
  });

  it("supports an empty alt for decorative images", async () => {
    const fixture = await render({ alt: "" });
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.alt).toBe("");
  });

  it("preserves width and height attributes", async () => {
    const fixture = await render({ width: 1920, height: 1080 });
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.getAttribute("width")).toBe("1920");
    expect(img.getAttribute("height")).toBe("1080");
    expect(img.style.aspectRatio).toBe("1920 / 1080");
  });

  it("defaults to lazy loading", async () => {
    const fixture = await render({});
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("supports eager loading", async () => {
    const fixture = await render({ loading: "eager" });
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(img.getAttribute("loading")).toBe("eager");
  });

  it("emits (load) when the image loads", async () => {
    const fixture = await render({});
    const events: void[] = [];
    fixture.componentInstance.imageLoad.subscribe(() => events.push(undefined));
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    img.dispatchEvent(new Event("load"));
    expect(events).toHaveLength(1);
  });

  it("emits (error) and swaps to the fallback URL on load failure", async () => {
    const fixture = await render({ fallback: "http://localhost:8788/fallback.svg" });
    const errors: void[] = [];
    fixture.componentInstance.imageError.subscribe(() => errors.push(undefined));
    const img = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    await fixture.whenStable();
    expect(errors).toHaveLength(1);
    expect(img.src).toBe("http://localhost:8788/fallback.svg");
  });
});
