import type { ComponentFixture } from "@angular/core/testing";
import type { RouterTestingHarness } from "@angular/router/testing";

/**
 * Drains pending promises, then runs change detection, repeatedly.
 *
 * `fixture.whenStable()` alone is not enough for these components. A page load here is a chain of
 * *independent* promise chains — the project list resolves, which kicks off folders and tags,
 * which a signal effect then reacts to by fetching assets — and each link only starts after the
 * previous one settles. `setTimeout(0)` yields to the macrotask queue between passes so every
 * link gets a turn, rather than asserting against a half-loaded page.
 *
 * Deliberately a fixed number of passes and not a "wait until idle" loop: a component that never
 * settles should fail a test, not hang it.
 */
export async function settle(
  fixture: ComponentFixture<unknown>,
  passes = 4,
): Promise<void> {
  for (let i = 0; i < passes; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

/**
 * The `RouterTestingHarness` equivalent of `settle()` — for a component whose route has a path
 * param (e.g. `:assetId`), which only ever resolves when the component is actually instantiated
 * through the router's own `RouterOutlet`. `TestBed.createComponent` bypasses that entirely and
 * hands the component the *root* `ActivatedRoute`, whose path params are always empty — so any
 * page reading `route.paramMap` for a path segment must be rendered via the harness, not created
 * directly.
 */
export async function settleHarness(
  harness: RouterTestingHarness,
  passes = 4,
): Promise<void> {
  for (let i = 0; i < passes; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
  }
}

/** Sets a `<volt-input>`'s inner native input and dispatches the event Angular binds to. */
export function typeInto(
  root: HTMLElement,
  testId: string,
  value: string,
): void {
  const input = root.querySelector<HTMLInputElement>(
    `[data-testid="${testId}"] input`,
  );
  if (!input) throw new Error(`No input found for data-testid="${testId}"`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Clicks a control by test id. Volt components render a real `<button>` inside a custom element,
 * and the host is what carries `data-testid`, so this prefers the inner button when there is one.
 */
export function clickTestId(root: HTMLElement, testId: string): void {
  const host = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!host) throw new Error(`No element found for data-testid="${testId}"`);
  (host.querySelector("button") ?? host).click();
}
