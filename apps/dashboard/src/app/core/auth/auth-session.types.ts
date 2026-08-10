/** Mirrors `SessionUser` in `src/server/lib/auth/session.ts` — the shape
 * `/proxy/auth/session` answers with. Kept as a hand-written mirror for the same
 * reason `api-info.types.ts` mirrors api-worker's response: there is no shared
 * OpenAPI/codegen step in this phase. */
export interface SessionUser {
  /** DevAuth's `sub` claim — the stable identifier this app keys identity on. */
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
}

export type AuthSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };
