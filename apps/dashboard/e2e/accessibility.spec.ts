import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  authenticateE2E,
  createProject,
  deleteProjectBySlug,
  uploadImage,
} from "./fixtures";

/**
 * Automated accessibility smoke coverage for the five representative pages named in the Phase 5
 * brief: Overview, Library, Upload, Asset details, Preset form. This is a smoke check, not a full
 * audit — the manual ARIA/focus/live-region review already done for this repo (dialogs, toasts,
 * form errors — see SECURITY.md-adjacent notes in context.md) still matters and isn't replaced by
 * this. `wcag2a`/`wcag2aa` only — not `best-practice`, which flags stylistic preferences axe itself
 * doesn't consider failures.
 *
 * Every scan waits for the page's entrance animation to finish first, which is
 * not a nicety — it is the difference between measuring the UI and measuring a
 * frame of a fade. `app-shell.component.ts` wraps the whole shell in
 * `moveEnter="fade-up"`, so for a few hundred milliseconds every colour on the
 * page is its real colour *blended with the background*, and axe reads that
 * blend as the element's own colour. That produced a long-standing set of
 * phantom `color-contrast` failures on `ix-service-status-card`'s badges (a
 * "pastel `#93bfd1` Healthy badge", a "peachy-tan `#deafac` Unreachable
 * badge") which were excluded here as unexplained, plus an intermittent one on
 * the project-initials badge whenever a project existed. None of them were
 * real: the project badge's fill was reported as `#1d7dae` at 4.44:1, while a
 * sampled pixel of the settled page is `#006ca4` at 5.56:1 — and `#1d7dae` is
 * exactly `#006ca4` composited at the 0.886 opacity the fade was passing
 * through. With the wait in place the exclusions are gone, so every element on
 * these pages is held to the real AA threshold again.
 */
/**
 * Waits for every *finite* animation to finish. Infinite ones (a spinner's
 * `animate-spin`) are skipped deliberately: their `finished` promise never
 * settles, so awaiting them would hang the run rather than fail it.
 */
async function waitForAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing !== undefined && timing.iterations !== Infinity;
    });
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  await waitForAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    serious
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n"),
  ).toEqual([]);
}

test.describe("Accessibility smoke", () => {
  test("Overview", async ({ page }) => {
    await authenticateE2E(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test.describe("pages that need a project", () => {
    let slug: string;

    test.beforeEach(async ({ page }) => {
      const project = await createProject(page, "a11y");
      slug = project.slug;
    });

    test.afterEach(async ({ page }) => {
      await deleteProjectBySlug(page, slug);
    });

    test("Library", async ({ page }) => {
      await page.goto("/library");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("Upload dialog", async ({ page }) => {
      await page.goto("/library");
      await page.getByTestId("upload-trigger").click();
      await expect(page.getByTestId("upload-dialog")).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("Asset details", async ({ page }) => {
      await page.goto("/library");
      await uploadImage(page, "a11y-asset.png");
      await expect(page.getByTestId("asset-grid")).toBeVisible({
        timeout: 20_000,
      });
      await page.getByTestId("asset-card").first().locator("a").click();
      await expect(page).toHaveURL(/\/library\/[^/]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // The Info tab isn't the default (Preview is) — its panel is inert markup, invisible to
      // axe, until actually selected. Clicking it is also what makes this a real scan of its
      // content rather than just the Preview tab's.
      await page.getByRole("tab", { name: "Info" }).click();
      await expect(page.getByTestId("asset-info-panel")).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("Preset form", async ({ page }) => {
      await page.goto("/presets");
      await page.getByTestId("preset-create").click();
      await expect(page).toHaveURL("/presets/new");
      await expectNoSeriousViolations(page);
    });
  });
});
