import { expect, test, type Page } from "@playwright/test";
import { createProject, deleteProjectBySlug, uploadImage } from "./fixtures";

/**
 * The Phase 4A end-to-end flow, against a real api-worker, a real D1 database and real R2
 * storage (Miniflare-simulated locally, no Cloudflare credentials — see ARCHITECTURE.md).
 *
 * Nothing here is stubbed: the upload is a real multipart request, `inspect-metadata` really
 * runs, and the assertions are on what the dashboard renders from the API's own responses.
 */
test.describe("Library flow", () => {
  let slug: string;

  test.beforeEach(async ({ page }) => {
    const project = await createProject(page, "library");
    slug = project.slug;
  });

  test.afterEach(async ({ page }) => {
    await deleteProjectBySlug(page, slug);
  });

  test("uploads an image, then finds, filters, deletes and restores it", async ({
    page,
  }) => {
    await page.goto("/library");

    // 1. A brand-new project is empty, and says so specifically.
    await expect(page.getByTestId("empty-state")).toContainText(
      "No assets yet",
    );

    // 2. Upload, and wait for real metadata inspection to complete.
    await uploadImage(page, "hero.png");

    // 3. The library picks the new asset up without a manual reload.
    const grid = page.getByTestId("asset-grid");
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const card = page.getByTestId("asset-card").first();
    await expect(card).toContainText("hero");

    // 4. Real metadata from the PNG header, not placeholders.
    await expect(card.getByTestId("status-badge")).toContainText("Ready");
    await expect(card).toContainText("8 × 6");

    // 5. Search narrows, and the term round-trips through the URL.
    await page.getByTestId("global-search-input").locator("input").fill("hero");
    await page
      .getByTestId("global-search-input")
      .locator("input")
      .press("Enter");
    await expect(page).toHaveURL(/[?&]q=hero/);
    await expect(page.getByTestId("asset-card")).toHaveCount(1);

    // 6. A search that matches nothing gets the filter-specific empty state, with a way out.
    await page
      .getByTestId("global-search-input")
      .locator("input")
      .fill("no-such-asset-xyz");
    await page
      .getByTestId("global-search-input")
      .locator("input")
      .press("Enter");
    await expect(page.getByTestId("empty-state")).toContainText(
      "No assets match these filters",
    );
    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("asset-card")).toHaveCount(1);

    // 7. Table view is the same data, and survives a reload via the URL.
    await page.getByTestId("view-table").click();
    await expect(page.getByTestId("asset-table")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("asset-table")).toBeVisible();
    await page.getByTestId("view-grid").click();
    await expect(page.getByTestId("asset-grid")).toBeVisible();

    // 8. Soft delete, confirmed. The asset leaves the default (active-only) view.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("asset-delete").first().click();
    await expect(page.getByTestId("empty-state")).toContainText(
      "No assets yet",
    );

    // 9. It is not gone — it is in the deleted view, and restorable from there.
    await page
      .getByTestId("filter-deleted")
      .locator("select")
      .selectOption("deleted");
    await expect(page.getByTestId("asset-card")).toHaveCount(1);
    await page.getByTestId("asset-restore").first().click();
    await expect(page.getByTestId("empty-state")).toContainText(
      "No assets match these filters",
    );

    // 10. Back in the active view, restored.
    await page
      .getByTestId("filter-deleted")
      .locator("select")
      .selectOption("active");
    await expect(page.getByTestId("asset-card")).toHaveCount(1);
  });

  test("keeps a filtered view shareable through the URL", async ({ page }) => {
    await uploadImageInLibrary(page);

    await page.goto("/library?status=ready&view=table&sort=name&dir=asc");

    await expect(page.getByTestId("asset-table")).toBeVisible();
    await expect(
      page.getByTestId("filter-status").locator("select"),
    ).toHaveValue("ready");
    await expect(page.getByTestId("filter-sort").locator("select")).toHaveValue(
      "name:asc",
    );
    await expect(page.getByTestId("asset-row")).toHaveCount(1);
  });

  async function uploadImageInLibrary(page: Page): Promise<void> {
    await page.goto("/library");
    await uploadImage(page, "shareable.png");
    await expect(page.getByTestId("asset-grid")).toBeVisible({
      timeout: 20_000,
    });
  }
});

test.describe("Projects flow", () => {
  let slug: string;

  test.afterEach(async ({ page }) => {
    if (slug) await deleteProjectBySlug(page, slug);
  });

  test("creates a project, adds a folder and a tag, and offers them as library filters", async ({
    page,
  }) => {
    const project = await createProject(page, "projects");
    slug = project.slug;

    // The new project becomes the selected one, across the whole dashboard.
    await expect(page.getByTestId("project-switcher-trigger")).toContainText(
      project.name,
    );

    // Folders and tags are created against that project and appear immediately.
    await page
      .getByTestId("folder-name-input")
      .locator("input")
      .fill("courses");
    await page.getByTestId("folder-create").click();
    await expect(page.getByTestId("folder-list")).toContainText("courses");

    await page.getByTestId("tag-name-input").locator("input").fill("marketing");
    await page.getByTestId("tag-create").click();
    await expect(page.getByTestId("tag-list")).toContainText("marketing");

    // Both show up as real filter options in the library.
    await page.goto("/library");
    await expect(page.getByTestId("filter-folder")).toContainText("courses");
    await expect(page.getByTestId("filter-tag")).toContainText("marketing");
  });

  test("refuses to delete a project that still has assets, and says why", async ({
    page,
  }) => {
    const project = await createProject(page, "guard");
    slug = project.slug;

    await page.goto("/library");
    await uploadImage(page, "guarded.png");
    await expect(page.getByTestId("asset-grid")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/projects");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByTestId("project-card")
      .filter({ hasText: project.name })
      .getByTestId("project-delete")
      .click();

    // The API refuses; the dashboard reports that rather than retrying with cascade=true.
    await expect(page.getByTestId("toast")).toContainText("active asset");
    await expect(page.getByTestId("project-list")).toContainText(project.name);
  });
});
