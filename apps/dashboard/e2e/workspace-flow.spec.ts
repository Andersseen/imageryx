import { expect, test } from "@playwright/test";
import { createProject, deleteProjectBySlug, uploadImage } from "./fixtures";

/**
 * The Phase 4B end-to-end flow: asset workspace, presets, processing and the reference pages —
 * against the same real api-worker/D1/R2 stack as `library-flow.spec.ts`. `TRANSFORMATION_PROVIDER`
 * is `mock` in this environment (see `apps/api-worker/wrangler.jsonc`), so every "simulated"
 * assertion below reflects the API's own real answer, not a guess.
 */
test.describe("Asset workspace, presets and processing flow", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  let slug: string;

  test.beforeEach(async ({ page }) => {
    const project = await createProject(page, "workspace");
    slug = project.slug;
  });

  test.afterEach(async ({ page }) => {
    await deleteProjectBySlug(page, slug);
  });

  test("opens an asset, creates a preset, generates a variant, and checks it across delivery, download, activity, processing and the reference pages", async ({
    page,
  }) => {
    // 1. Upload a real asset and open its workspace from the library grid.
    await page.goto("/library");
    await uploadImage(page, "workspace.png");
    await expect(page.getByTestId("asset-grid")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("asset-card").first().locator("a").click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);

    // 2. The header and info panel show the asset's real metadata — never a raw storage key.
    await expect(
      page.getByRole("heading", { level: 1, name: "workspace" }),
    ).toBeVisible();
    const infoPanel = page.getByTestId("asset-info-panel");
    await expect(infoPanel).toContainText("8 × 6");
    await expect(infoPanel).not.toContainText("derived/");

    // 3. Create a custom preset for this project.
    await page.goto("/presets");
    await page.getByTestId("preset-create").click();
    await expect(page).toHaveURL("/presets/new");
    await page
      .getByTestId("preset-name-input")
      .locator("input")
      .fill("E2E Thumbnail");
    await page.locator("#resize-width").locator("input").fill("100");
    await page.locator("#resize-height").locator("input").fill("100");
    await page.getByTestId("preset-save").click();
    await expect(page).toHaveURL(/\/presets\/[^/]+$/);
    await expect(
      page.getByTestId("preset-name-input").locator("input"),
    ).toHaveValue("E2E Thumbnail");

    // 4. The provider compatibility panel reflects the real capability check — resize is
    // supported everywhere, so nothing is flagged unsupported.
    await expect(page.getByTestId("provider-compatibility")).not.toContainText(
      "unsupported",
    );

    // 5. Back in the library, open the same asset and switch to its Variants tab.
    await page.goto("/library");
    await page.getByTestId("asset-card").first().locator("a").click();
    await page.getByRole("tab", { name: "Variants" }).click();

    // 6. Generate a variant from the new preset.
    await page
      .getByTestId("variant-preset-select")
      .selectOption({ label: "E2E Thumbnail" });
    await expect(page.getByText(/Expected: \d+ × \d+/)).toBeVisible();
    await page.getByTestId("variant-generate-submit").click();

    // 7. Real, scoped polling — no manual reload — takes the row to Ready.
    const variantRow = page.getByTestId("variant-row").first();
    await expect(variantRow.getByTestId("status-badge")).toContainText(
      "Ready",
      { timeout: 20_000 },
    );
    // Mock provider: the API's own answer, not a client-side guess.
    await expect(variantRow).toContainText("Simulated");

    // 8. The before/after comparison is labeled simulated, never implying a real quality claim.
    await variantRow.getByTestId("variant-compare").click();
    await expect(page.getByTestId("asset-comparison")).toContainText(
      "Simulated",
    );

    // 9. Delivery tab: the SDK snippet resolves to this preset's real slug (the HTML snippet is
    // always the original — it takes no preset param), and its copy button gives real feedback.
    await page.getByRole("tab", { name: "Delivery" }).click();
    const sdkSnippetSection = page.getByTestId("snippet-sdk").locator("..");
    await expect(sdkSnippetSection).toContainText("e2e-thumbnail");
    const sdkCopyButton = sdkSnippetSection.getByTestId("copy-button");
    await sdkCopyButton.click();
    await expect(sdkCopyButton).toContainText("Copied");

    // 10. Download tab: a signed link is only created on click, never speculatively.
    await page.getByRole("tab", { name: "Download" }).click();
    await expect(page.getByTestId("download-option").first()).not.toContainText(
      "http",
    );
    await page.getByTestId("download-create-link").first().click();
    await expect(
      page.getByTestId("download-option").first().locator("a[href]"),
    ).toBeVisible({
      timeout: 10_000,
    });

    // 11. Activity tab: a human-readable timeline, not raw JSON as the primary view.
    await page.getByRole("tab", { name: "Activity" }).click();
    const timeline = page.getByTestId("activity-timeline");
    await expect(timeline).toContainText("Uploaded");
    await expect(timeline).toContainText("Variant ready");
    await expect(timeline).not.toContainText("{");

    // 12. Processing: the real job this generation created shows Completed, with no
    // retry/cancel offered for a terminal job.
    await page.goto("/processing");
    const jobRow = page
      .getByTestId("job-row")
      .filter({ hasText: "Generate variant" })
      .first();
    await expect(jobRow).toContainText("Completed", { timeout: 10_000 });
    await expect(jobRow.getByTestId("job-retry")).toHaveCount(0);
    await expect(jobRow.getByTestId("job-cancel")).toHaveCount(0);

    // 13. The job detail page gives a human-readable summary plus opt-in raw data.
    await jobRow.locator("a").first().click();
    await expect(page).toHaveURL(/\/processing\/[^/]+$/);
    await expect(page.getByTestId("job-raw-data")).toHaveCount(0);
    await page.getByTestId("job-raw-toggle").click();
    await expect(page.getByTestId("job-raw-data")).toContainText("variantId");

    // 14. The API reference page reports real, live health and never the full API key.
    await page.goto("/api");
    await expect(page.getByText("Healthy").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("api-key-prefix")).not.toBeEmpty();
    await expect(page.getByTestId("api-key-prefix")).not.toContainText(
      "imgx_dev_local",
    );

    // 15. Settings mirrors the same real configuration, entirely read-only.
    await page.goto("/settings");
    await expect(page.getByTestId("settings-transformations")).toContainText(
      "mock",
      { timeout: 10_000 },
    );
    await expect(page.locator('[data-testid$="-save"]')).toHaveCount(0);
  });
});
