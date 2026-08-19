import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetWorkspaceService } from "../../../core/assets/asset-workspace.service";
import { NotificationService } from "../../../core/notifications/notification.service";
import { IMAGERYX_CLIENT } from "../../../core/sdk/imageryx-client.token";
import { clickTestId, settle, typeInto } from "../../../testing/render";
import {
  apiErrorResponse,
  assetDetailsFixture,
  assetFixture,
  createStubApi,
  folderFixture,
  type StubApi,
} from "../../../testing/stub-client";
import { AssetSettings } from "./asset-settings.component";

/**
 * The settings form is the only place an asset's identity is edited, and it
 * sends *only what changed* — a rename must not also rewrite the slug that
 * every public delivery URL embeds. These tests assert on the requests it
 * makes, not on its internal form state, so that guarantee is checked where
 * it actually matters.
 */
describe("AssetSettings", () => {
  let api: StubApi;

  async function render(stub: StubApi = createStubApi(baseState())) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [AssetSettings],
      providers: [
        provideZonelessChangeDetection(),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
        AssetWorkspaceService,
      ],
    });

    const workspace = TestBed.inject(AssetWorkspaceService);
    await workspace.load("a-1");

    const fixture = TestBed.createComponent(AssetSettings);
    fixture.componentRef.setInput("asset", workspace.asset());
    fixture.componentRef.setInput("workspace", workspace);
    fixture.componentRef.setInput("folders", [folderFixture("f-1", "courses")]);
    await settle(fixture, 2);
    return fixture;
  }

  function baseState() {
    const base = assetFixture("a-1", "Hero", { visibility: "public" });
    return {
      assets: [base],
      assetDetails: {
        "a-1": {
          ...assetDetailsFixture(base),
          slug: "hero",
          tags: ["hero"],
          folderId: null,
          downloadOriginalEnabled: false,
        },
      },
    };
  }

  function findRequest(method: string, pattern: RegExp) {
    return api.requests.find(
      (r) => r.method === method && pattern.test(r.path),
    );
  }

  function saveButton(root: HTMLElement): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>(
      '[data-testid="settings-save"] button',
    );
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("keeps Save disabled until something actually changes", async () => {
    const fixture = await render();

    expect(saveButton(fixture.nativeElement)?.disabled).toBe(true);

    typeInto(fixture.nativeElement, "settings-name", "Hero Renamed");
    await settle(fixture, 1);

    expect(saveButton(fixture.nativeElement)?.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain("Unsaved changes");
  });

  it("sends only the changed field, leaving the slug in every delivery URL alone", async () => {
    const fixture = await render();

    typeInto(fixture.nativeElement, "settings-name", "Hero Renamed");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "settings-save");
    await settle(fixture, 2);

    const patch = findRequest("PATCH", /\/v1\/assets\/a-1$/);
    expect(patch?.body).toEqual({ name: "Hero Renamed" });
  });

  it("warns about a slug change and asks before committing one", async () => {
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const fixture = await render();

    typeInto(fixture.nativeElement, "settings-slug", "hero-v2");
    await settle(fixture, 1);
    expect(fixture.nativeElement.textContent).toContain(
      "changes this asset's public delivery URL",
    );

    clickTestId(fixture.nativeElement, "settings-save");
    await settle(fixture, 2);

    expect(confirm).toHaveBeenCalledOnce();
    expect(findRequest("PATCH", /\/v1\/assets\/a-1$/)?.body).toEqual({
      slug: "hero-v2",
    });
  });

  it("sends nothing when the slug confirmation is declined", async () => {
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    const fixture = await render();

    typeInto(fixture.nativeElement, "settings-slug", "hero-v2");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "settings-save");
    await settle(fixture, 2);

    expect(findRequest("PATCH", /\/v1\/assets\/a-1$/)).toBeUndefined();
    // Still dirty, so the user can retry rather than losing the edit.
    expect(saveButton(fixture.nativeElement)?.disabled).toBe(false);
  });

  it("moves the asset and replaces its tags through their own endpoints", async () => {
    const fixture = await render();

    const folder = fixture.nativeElement.querySelector<HTMLSelectElement>(
      'select[data-testid="settings-folder"]',
    );
    folder!.value = "f-1";
    folder!.dispatchEvent(new Event("change", { bubbles: true }));
    typeInto(fixture.nativeElement, "settings-tags", "hero, marketing");
    await settle(fixture, 1);

    clickTestId(fixture.nativeElement, "settings-save");
    await settle(fixture, 3);

    expect(findRequest("POST", /\/v1\/assets\/a-1\/move$/)?.body).toEqual({
      folderId: "f-1",
    });
    expect(findRequest("PUT", /\/v1\/assets\/a-1\/tags$/)?.body).toEqual({
      tags: ["hero", "marketing"],
    });
  });

  it("reports a rejected save with the API's own message and does not claim success", async () => {
    const stub = createStubApi(baseState());
    stub.override("PATCH", /\/v1\/assets\/a-1$/, () =>
      apiErrorResponse(409, "duplicate_asset_path", "That slug is taken."),
    );
    const fixture = await render(stub);

    typeInto(fixture.nativeElement, "settings-name", "Hero Renamed");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "settings-save");
    await settle(fixture, 2);

    const toasts = TestBed.inject(NotificationService).notifications();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe("error");
    expect(toasts[0]?.message).toBe("That slug is taken.");
  });

  it("discards edits back to the server's values", async () => {
    const fixture = await render();

    typeInto(fixture.nativeElement, "settings-name", "Hero Renamed");
    await settle(fixture, 1);

    clickTestId(fixture.nativeElement, "settings-discard");
    await settle(fixture, 1);

    expect(saveButton(fixture.nativeElement)?.disabled).toBe(true);
    const name = fixture.nativeElement.querySelector<HTMLInputElement>(
      '[data-testid="settings-name"] input',
    );
    expect(name?.value).toBe("Hero");
  });
});
