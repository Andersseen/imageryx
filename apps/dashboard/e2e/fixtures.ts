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
export function pngUpload(name: string): UploadFile {
  const fixture = createDecodableImageFixture("image/png");
  return { name, mimeType: "image/png", buffer: Buffer.from(fixture.bytes) };
}

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A real SVG document — the format whose upload path is text, not magic bytes. */
export function svgUpload(name: string): UploadFile {
  const fixture = createDecodableImageFixture("image/svg+xml");
  return {
    name,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(fixture.bytes),
  };
}

/**
 * PNG bytes presented as a JPEG. The claimed type and extension agree with
 * each other, so only a real signature check can catch it — which is exactly
 * the rejection the dialog has to report back to the user.
 */
export function mislabeledUpload(name: string): UploadFile {
  const fixture = createDecodableImageFixture("image/png");
  return { name, mimeType: "image/jpeg", buffer: Buffer.from(fixture.bytes) };
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
  await uploadFiles(page, [pngUpload(fileName)]);
}

/**
 * The same flow for any set of files, without assuming they succeed — a
 * rejected upload has to be observable too. The wait is on every queue item
 * having left its in-flight state rather than on a success badge, and the
 * dialog is left open so the caller can assert on what it reports.
 */
export async function submitUpload(
  page: Page,
  files: UploadFile[],
): Promise<void> {
  await page.getByTestId("upload-trigger").click();
  const dialog = page.getByTestId("upload-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByTestId("upload-file-input").setInputFiles(files);
  await expect(dialog.getByTestId("upload-selection-summary")).toContainText(
    `${files.length} file(s) selected`,
  );

  await dialog.getByTestId("upload-submit").click();
  await expect(dialog.getByTestId("upload-queue")).not.toContainText(
    /Queued|Uploading|Processing/,
    { timeout: 30_000 },
  );
}

/** Submits, requires every file to have reached `Ready`, then closes the dialog. */
export async function uploadFiles(
  page: Page,
  files: UploadFile[],
): Promise<void> {
  await submitUpload(page, files);
  const dialog = page.getByTestId("upload-dialog");
  const queue = dialog.getByTestId("upload-queue");
  await expect(queue).toContainText("Ready");
  await expect(queue).not.toContainText("Failed");

  await dialog.getByTestId("upload-close").click();
  await expect(dialog).toBeHidden();
}

/** Creates a folder through the real projects UI, for uploads that target one. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await page.goto("/projects");
  await page.getByTestId("folder-name-input").locator("input").fill(name);
  await page.getByTestId("folder-create").click();
  await expect(page.getByTestId("folder-list")).toContainText(name);
}
