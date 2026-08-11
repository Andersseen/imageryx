import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionService } from "./auth-session.service";

describe("AuthSessionService", () => {
  let service: AuthSessionService;

  // Constructed directly rather than through TestBed: this service injects
  // nothing, so a testing module would only add a per-test configure/reset
  // dance around a plain object.
  beforeEach(() => {
    service = new AuthSessionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubFetch(response: Response | Error) {
    const fetchSpy = vi.fn(async () =>
      response instanceof Error ? Promise.reject(response) : response,
    );
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("starts in a loading state, having asked nobody", () => {
    expect(service.session()).toEqual({ status: "loading" });
    expect(service.isAuthenticated()).toBe(false);
  });

  it("exposes the signed-in user after a refresh", async () => {
    const user = {
      sub: "devauth-user-42",
      email: "andrii@example.com",
      name: "Andrii",
      picture: null,
    };
    const fetchSpy = stubFetch(json({ authenticated: true, user }));

    await service.refresh();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/proxy/auth/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.sub).toBe("devauth-user-42");
  });

  it("reports anonymous rather than throwing when the endpoint is unreachable", async () => {
    stubFetch(new Error("offline"));

    await service.refresh();

    expect(service.session()).toEqual({ status: "anonymous" });
    expect(service.user()).toBeNull();
  });

  it("treats a non-JSON session response as anonymous", async () => {
    stubFetch(
      new Response("<!doctype html><ix-root></ix-root>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await service.refresh();

    expect(service.session()).toEqual({ status: "anonymous" });
    expect(service.user()).toBeNull();
  });

  it("treats an authenticated:true body with no user as anonymous", async () => {
    stubFetch(json({ authenticated: true, user: null }));

    await service.refresh();

    expect(service.isAuthenticated()).toBe(false);
  });

  it("builds a login URL carrying an encoded returnTo", () => {
    expect(service.loginUrl("/library?tab=variants")).toBe(
      "/proxy/auth/login?returnTo=%2Flibrary%3Ftab%3Dvariants",
    );
  });

  it("logs out with a POST and drops the local state", async () => {
    const fetchSpy = stubFetch(new Response(null, { status: 204 }));

    await service.logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/proxy/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(service.session()).toEqual({ status: "anonymous" });
  });
});
