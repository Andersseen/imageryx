import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeService } from "./theme.service";

/**
 * The initial preference is read at *construction*, so each case configures
 * storage and `matchMedia` before injecting the service — injecting first and
 * then setting them would only ever test the default.
 */
describe("ThemeService", () => {
  function mockPrefersDark(dark: boolean): void {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: dark && query.includes("prefers-color-scheme: dark"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  function inject(): ThemeService {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    localStorage.clear();
    mockPrefersDark(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("honours a stored choice over the system preference", () => {
    localStorage.setItem("imageryx.theme", "light");
    mockPrefersDark(true);

    expect(inject().isDark()).toBe(false);
  });

  it("follows the system preference on a first visit, with nothing stored", () => {
    mockPrefersDark(true);

    expect(inject().isDark()).toBe(true);
    // A first visit must not write a choice the user never made.
    expect(localStorage.getItem("imageryx.theme")).toBeNull();
  });

  it("persists the choice so a reload keeps it", () => {
    const theme = inject();

    theme.toggle();

    expect(theme.isDark()).toBe(true);
    expect(localStorage.getItem("imageryx.theme")).toBe("dark");

    theme.toggle();

    expect(theme.isDark()).toBe(false);
    expect(localStorage.getItem("imageryx.theme")).toBe("light");
  });

  it("applies an explicit value without toggling relative to the current one", () => {
    const theme = inject();

    theme.set(false);

    expect(theme.isDark()).toBe(false);
    expect(localStorage.getItem("imageryx.theme")).toBe("light");
  });
});
