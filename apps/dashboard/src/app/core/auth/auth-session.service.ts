import { Injectable, computed, signal } from "@angular/core";
import type {
  AuthSessionState,
  SessionResponse,
  SessionUser,
} from "./auth-session.types";

/** Built from the same origin, so the `HttpOnly` session cookie is sent
 * automatically and no token is ever handled by browser code. */
const SESSION_ENDPOINT = "/proxy/auth/session";
const LOGIN_ENDPOINT = "/proxy/auth/login";
const LOGOUT_ENDPOINT = "/proxy/auth/logout";

/**
 * How the app knows who is signed in.
 *
 * Reads Imageryx's own session from its own server route — DevAuth is never
 * contacted from here, and there is no access token in browser memory to leak.
 * The sign-in entry point is a plain navigation to `/proxy/auth/login`, not a
 * `fetch`: the flow is a redirect hand-off to DevAuth, which owns the login,
 * sign-up, password-reset and GitHub-linking screens. This app has no local
 * account model and renders none of those.
 */
@Injectable({ providedIn: "root" })
export class AuthSessionService {
  private readonly state = signal<AuthSessionState>({ status: "loading" });

  readonly session = this.state.asReadonly();

  readonly user = computed<SessionUser | null>(() => {
    const current = this.state();
    return current.status === "authenticated" ? current.user : null;
  });

  readonly isAuthenticated = computed(
    () => this.state().status === "authenticated",
  );

  /**
   * `returnTo` is passed through, but the server re-validates it — a same-site
   * path is enforced there, never here, because the browser is not where that
   * decision can be trusted.
   */
  loginUrl(returnTo?: string): string {
    const target = returnTo ?? this.currentPath();
    return `${LOGIN_ENDPOINT}?returnTo=${encodeURIComponent(target)}`;
  }

  async refresh(): Promise<AuthSessionState> {
    try {
      const response = await fetch(SESSION_ENDPOINT, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        this.state.set({ status: "anonymous" });
        return this.state();
      }

      const body = (await response.json()) as SessionResponse;
      this.state.set(
        body.authenticated && body.user
          ? { status: "authenticated", user: body.user }
          : { status: "anonymous" },
      );
    } catch {
      // A session endpoint that cannot be reached means "not signed in" as far
      // as the UI is concerned — never a thrown error that blanks a page.
      this.state.set({ status: "anonymous" });
    }

    return this.state();
  }

  /** Full-page navigation, so the browser follows the redirect to DevAuth. */
  startLogin(returnTo?: string): void {
    globalThis.location.assign(this.loginUrl(returnTo));
  }

  /** POST, matching the route: a GET logout is triggerable by any third-party
   * page embedding an image tag. */
  async logout(): Promise<void> {
    await fetch(LOGOUT_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
    });
    this.state.set({ status: "anonymous" });
  }

  private currentPath(): string {
    const { pathname, search } = globalThis.location;
    return `${pathname}${search}`;
  }
}
