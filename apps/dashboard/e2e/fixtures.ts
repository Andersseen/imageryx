import { createDecodableImageFixture } from "@imageryx/test-utils";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * A real PNG with a correctly-encoded header, generated in code rather than committed.
 *
 * This repo keeps no binary fixtures (see `@imageryx/test-utils`), and generating the bytes has a
 * second benefit here: the header carries genuine width/height/alpha, so `inspect-metadata`
 * produces real dimensions rather than the nulls a random byte blob would yield — which is what
 * makes "wait until the asset is ready" a meaningful assertion instead of a timer.
 */
export function pngUpload(name: string): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const fixture = createDecodableImageFixture("image/png");
  return { name, mimeType: "image/png", buffer: Buffer.from(fixture.bytes) };
}

/** Unique per run, so a re-run never collides with rows a previous run left behind. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function authenticateE2E(page: Page): Promise<void> {
  const response = await page.request.post("/proxy/auth/test-login");
  expect(response.ok()).toBe(true);
}

/**
 * Creates a project through the real UI and returns its name and slug.
 *
 * Each spec gets its own project rather than sharing seeded data: the flow deletes and restores
 * assets, and doing that to shared rows would make specs order-dependent.
 */
export async function createProject(
  page: Page,
  label: string,
): Promise<{ name: string; slug: string }> {
  await authenticateE2E(page);
  const suffix = uniqueSuffix();
  const name = `E2E ${label} ${suffix}`;
  const slug = `e2e-${label}-${suffix}`.toLowerCase();

  await page.goto("/projects");
  await page.getByTestId("project-create").click();

  const dialog = page.getByTestId("project-form-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("project-name-input").locator("input").fill(name);
  await dialog.getByTestId("project-slug-input").locator("input").fill(slug);
  await dialog.getByTestId("project-form-submit").click();

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("project-list")).toContainText(name);

  return { name, slug };
}

/** Deletes the project through the API so a failed assertion mid-spec still cleans up. */
export async function deleteProjectBySlug(
  page: Page,
  slug: string,
): Promise<void> {
  const response = await page.request.get("/proxy/v1/projects", {
    params: { pageSize: 100 },
  });
  if (!response.ok()) return;
  const body = (await response.json()) as {
    items: { id: string; slug: string }[];
  };
  const project = body.items.find((item) => item.slug === slug);
  if (!project) return;
  await page.request.delete(`/proxy/v1/projects/${project.id}`, {
    params: { cascade: true },
  });
}

/**
 * Uploads a file through the dialog and waits for it to reach a terminal state.
 *
 * Waits on the queue item's own badge rather than a fixed timeout: processing genuinely runs off
 * the request path, so how long it takes is not something a sleep should encode.
 */
export async function uploadImage(page: Page, fileName: string): Promise<void> {
  await page.getByTestId("upload-trigger").click();
  const dialog = page.getByTestId("upload-dialog");
  await expect(dialog).toBeVisible();

  await dialog
    .getByTestId("upload-file-input")
    .setInputFiles(pngUpload(fileName));
  await expect(dialog.getByTestId("upload-selection-summary")).toContainText(
    "1 file(s) selected",
  );

  await dialog.getByTestId("upload-submit").click();
  await expect(dialog.getByTestId("upload-queue")).toContainText("Ready", {
    timeout: 30_000,
  });

  await dialog.getByTestId("upload-close").click();
  await expect(dialog).toBeHidden();
}
