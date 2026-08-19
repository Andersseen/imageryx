import { expect, test } from "@playwright/test";
import {
  createFolder,
  createProject,
  deleteProjectBySlug,
  mislabeledUpload,
  pngUpload,
  submitUpload,
  svgUpload,
  uploadFiles,
} from "./fixtures";

/**
 * Upload is the one flow every other page depends on, and the one whose
 * failures are least visible from a unit test: the file crosses the browser,
 * the dashboard's server-side proxy, api-worker's multipart parsing, real
 * signature validation, R2 and D1 before anything appears on screen. These
 * specs cover the parts `library-flow.spec.ts` deliberately doesn't — the
 * formats other than PNG, a rejection the user has to be told about, the
 * options the dialog sends, and more than one file at a time.
 *
 * A production upload failure that shipped past every existing test is what
 * these are here for: `TRANSFORMATION_PROVIDER=cloudinary` made api-worker
 * reject its own storage configuration, so every upload returned an opaque
 * 500 (see apps/api-worker/test/env.spec.ts, which covers that specific
 * cause; this file covers the surface the user actually sees).
 */
test.describe("Upload flow", () => {
  let slug: string;

  test.beforeEach(async ({ page }) => {
    const project = await createProject(page, "upload");
    slug = project.slug;
  });

  test.afterEach(async ({ page }) => {
    await deleteProjectBySlug(page, slug);
  });

  test("uploads an SVG — a format identified by its text, not by magic bytes", async ({
    page,
  }) => {
    await page.goto("/library");
    await uploadFiles(page, [svgUpload("logo.svg")]);

    const card = page.getByTestId("asset-card").first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("logo");
    await expect(card.getByTestId("status-badge")).toContainText("Ready");
  });

  test("reports a rejected file with the API's own reason, and stores nothing", async ({
    page,
  }) => {
    await page.goto("/library");
    await submitUpload(page, [mislabeledUpload("not-really.jpg")]);

    const dialog = page.getByTestId("upload-dialog");
    await expect(dialog.getByTestId("upload-queue")).toContainText("Failed");
    // api-worker's own sentence, not a generic "something went wrong".
    await expect(dialog.getByTestId("upload-queue")).toContainText(
      /MIME type, extension, or signature/i,
    );
    await expect(page.getByTestId("toast")).toContainText(
      "1 of 1 upload(s) failed",
    );

    // The dialog stays open so the reason remains readable.
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("upload-close").click();

    // A rejected upload must not leave a half-created asset behind.
    await expect(page.getByTestId("empty-state")).toContainText(
      "No assets yet",
    );
  });

  test("applies the folder, visibility and tags chosen in the dialog", async ({
    page,
  }) => {
    await createFolder(page, "courses");
    await page.goto("/library");

    await page.getByTestId("upload-trigger").click();
    const dialog = page.getByTestId("upload-dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByTestId("upload-file-input")
      .setInputFiles(pngUpload("scoped.png"));
    await dialog
      .getByTestId("upload-folder")
      .selectOption({ label: "courses" });
    await dialog.getByTestId("upload-visibility").selectOption("private");
    await dialog
      .getByTestId("upload-tags")
      .locator("input")
      .fill("hero, marketing");

    await dialog.getByTestId("upload-submit").click();
    await expect(dialog.getByTestId("upload-queue")).toContainText("Ready", {
      timeout: 30_000,
    });
    await dialog.getByTestId("upload-close").click();

    // Every chosen option is real state the API stored, so each one is
    // checkable through a filter rather than through the dialog's own memory.
    await page.goto("/library");
    await page.getByTestId("filter-folder").selectOption({ label: "courses" });
    await expect(page.getByTestId("asset-card")).toHaveCount(1);

    await page.getByTestId("filter-visibility").selectOption("private");
    await expect(page.getByTestId("asset-card")).toHaveCount(1);

    await page.getByTestId("filter-tag").selectOption({ label: "hero" });
    await expect(page.getByTestId("asset-card")).toHaveCount(1);
    await expect(page.getByTestId("asset-card").first()).toContainText(
      "scoped",
    );
  });

  test("uploads several files in one go and lists every one of them", async ({
    page,
  }) => {
    await page.goto("/library");
    await uploadFiles(page, [
      pngUpload("first.png"),
      pngUpload("second.png"),
      svgUpload("third.svg"),
    ]);

    await expect(page.getByTestId("asset-card")).toHaveCount(3, {
      timeout: 20_000,
    });
    const grid = page.getByTestId("asset-grid");
    await expect(grid).toContainText("first");
    await expect(grid).toContainText("second");
    await expect(grid).toContainText("third");
  });

  test("keeps the good files when one in the batch is rejected", async ({
    page,
  }) => {
    await page.goto("/library");
    await submitUpload(page, [
      mislabeledUpload("broken.jpg"),
      pngUpload("fine.png"),
    ]);

    const queue = page.getByTestId("upload-dialog").getByTestId("upload-queue");
    await expect(queue).toContainText("Failed");
    await expect(queue).toContainText("Ready");
    await page.getByTestId("upload-dialog").getByTestId("upload-close").click();

    await expect(page.getByTestId("asset-card")).toHaveCount(1);
    await expect(page.getByTestId("asset-card").first()).toContainText("fine");
  });
});
