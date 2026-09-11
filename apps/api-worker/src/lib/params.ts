import type { Context } from "hono";
import type { AppVariables } from "./app-variables";

/**
 * Hono's `c.req.param(name)` types as `string | undefined` when called
 * from a sub-app mounted via `.route()` (it can't statically see the
 * parent's route pattern) — but the parameter is always present at
 * runtime once the route matched. This documents that invariant in one
 * place instead of an `as string` cast at every call site.
 *
 * Generic over `E` (rather than a fixed `Bindings` shape) so this accepts
 * a `Context` typed with whichever Bindings its own caller declares —
 * Hono's `Context.get`/`.set` typing is invariant in `E`, so a fixed
 * `{ Variables: AppVariables }` (no `Bindings`) would reject every
 * Cloudflare route's `Context<{ Bindings: Env; ... }>` even though both
 * shapes only ever need `Variables` here.
 */
export function param<E extends { Variables: AppVariables }>(
  c: Context<E>,
  name: string,
): string {
  return c.req.param(name) as string;
}
