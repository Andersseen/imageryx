import type { D1Database } from "@cloudflare/workers-types";

/** Alias kept for readability at repository call sites — every repository is constructed with one of these. */
export type D1Client = D1Database;
