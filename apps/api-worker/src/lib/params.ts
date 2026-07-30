import type { Context } from "hono";
import type { RequestIdVariables } from "../middleware/request-id";

type AppContext = Context<{ Bindings: Env; Variables: RequestIdVariables }>;

/**
 * Hono's `c.req.param(name)` types as `string | undefined` when called
 * from a sub-app mounted via `.route()` (it can't statically see the
 * parent's route pattern) — but the parameter is always present at
 * runtime once the route matched. This documents that invariant in one
 * place instead of an `as string` cast at every call site.
 */
export function param(c: AppContext, name: string): string {
  return c.req.param(name) as string;
}
