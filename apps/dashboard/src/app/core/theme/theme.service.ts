import { Injectable, signal } from "@angular/core";
import { applyVoltTheme } from "@voltui/components";

const STORAGE_KEY = "imageryx.theme";

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function readInitialPreference(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return prefersDark();
}

/**
 * Thin wrapper around Volt UI's `applyVoltTheme` that persists the user's
 * choice and falls back to `prefers-color-scheme` on first visit.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly isDark = signal(readInitialPreference());

  constructor() {
    applyVoltTheme({ dark: this.isDark() });
  }

  toggle(): void {
    this.set(!this.isDark());
  }

  set(dark: boolean): void {
    this.isDark.set(dark);
    applyVoltTheme({ dark });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    }
  }
}
