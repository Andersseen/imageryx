import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationService } from "../core/notifications/notification.service";
import { ToastHost } from "./toast-host.component";

/**
 * These exist because the previous implementation, built on a third-party toast service, held
 * the right data and rendered nothing — a failure only visible in a browser. Asserting on the
 * rendered DOM (not on the service's state) is what makes that class of bug impossible to ship
 * again.
 */
describe("ToastHost", () => {
  let notifications: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [ToastHost],
      providers: [provideZonelessChangeDetection()],
    });
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  async function render() {
    const fixture = TestBed.createComponent(ToastHost);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function toasts(fixture: {
    nativeElement: HTMLElement;
  }): NodeListOf<HTMLElement> {
    return fixture.nativeElement.querySelectorAll<HTMLElement>(
      '[data-testid="toast"]',
    );
  }

  it("renders nothing when there is nothing to announce", async () => {
    const fixture = await render();
    expect(toasts(fixture)).toHaveLength(0);
  });

  it("renders a notification raised after the first render", async () => {
    const fixture = await render();

    notifications.success("Asset deleted", '"Hero" moved to deleted.');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts(fixture)).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain("Asset deleted");
    expect(fixture.nativeElement.textContent).toContain(
      '"Hero" moved to deleted.',
    );
  });

  it("announces politely without stealing focus", async () => {
    const fixture = await render();
    const region = fixture.nativeElement.querySelector('[role="status"]');
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });

  it("states severity in words as well as colour", async () => {
    const fixture = await render();
    notifications.error("Upload failed", "The file is not a supported image.");
    fixture.detectChanges();
    await fixture.whenStable();

    // The tone word lives in a screen-reader-only span, so it never depends on the tint alone.
    expect(
      fixture.nativeElement.querySelector(".sr-only")?.textContent,
    ).toContain("Error");
  });

  it("auto-dismisses after the notification's own duration", async () => {
    const fixture = await render();
    notifications.success("Saved", "Done.");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(toasts(fixture)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts(fixture)).toHaveLength(0);
  });

  it("keeps an error on screen longer than a success", async () => {
    const fixture = await render();
    notifications.success("Saved", "Done.");
    notifications.error("Failed", "Nope.");
    fixture.detectChanges();
    await fixture.whenStable();

    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts(fixture)).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain("Failed");
  });

  it("dismisses on demand", async () => {
    const fixture = await render();
    notifications.info("Note", "Something happened.");
    fixture.detectChanges();
    await fixture.whenStable();

    toasts(fixture)[0]?.querySelector("button")?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts(fixture)).toHaveLength(0);
  });

  it("caps how many stack up, keeping the newest", async () => {
    const fixture = await render();
    for (let i = 1; i <= 6; i++) notifications.info(`Note ${i}`, "…");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts(fixture)).toHaveLength(4);
    expect(fixture.nativeElement.textContent).not.toContain("Note 1");
    expect(fixture.nativeElement.textContent).toContain("Note 6");
  });
});

describe("NotificationService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("schedules no timer at all when idle", () => {
    TestBed.inject(NotificationService);
    // The whole reason for owning this: an idle dashboard must not run a repeating timer.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a notification's timer when it is dismissed early", () => {
    const service = TestBed.inject(NotificationService);
    const id = service.success("Saved", "Done.");
    expect(vi.getTimerCount()).toBe(1);
    service.dismiss(id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dismissAll clears every pending timer", () => {
    const service = TestBed.inject(NotificationService);
    service.success("A", "…");
    service.error("B", "…");
    service.dismissAll();
    expect(vi.getTimerCount()).toBe(0);
    expect(service.notifications()).toHaveLength(0);
  });
});
