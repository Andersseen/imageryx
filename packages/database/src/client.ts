/**
 * Runtime-independent database execution boundary. Every repository and
 * cross-table service in this package is written against this interface,
 * never against a specific runtime's driver — `D1DatabaseClient`
 * (Cloudflare D1, see `d1-database-client.ts`) and `SqliteDatabaseClient`
 * (Node `node:sqlite`, see `node/sqlite-database-client.ts`) are its only
 * two implementations. Sized to exactly what repositories actually call:
 * nothing here inspects `.run()`/`.batch()` result metadata (row counts,
 * last insert id) because no caller in this codebase does either.
 */

/** A single unexecuted SQL statement — plain data, not a live prepared-statement handle, so a caller can build a list of them (e.g. `buildInsertStatement()`) before deciding whether to run them individually or as one `batch()`. */
export interface DatabaseStatement {
  readonly sql: string;
  readonly params?: readonly unknown[];
}

/** The one piece of execution metadata a repository actually reads today (`ApiKeyRepository.revoke()`, to distinguish "revoked" from "already revoked/nonexistent") — deliberately not the full D1 `meta` shape (last row id, duration, etc.), since nothing else uses it. */
export interface DatabaseExecutionResult {
  readonly changes: number;
}

export interface DatabaseClient {
  /** A SELECT returning zero or more rows. */
  query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
  /** A SELECT expected to return at most one row. */
  queryOne<T>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  /** An INSERT/UPDATE/DELETE run on its own. */
  execute(
    sql: string,
    params?: readonly unknown[],
  ): Promise<DatabaseExecutionResult>;
  /**
   * Runs every statement as one implicit transaction — mirrors D1's
   * `.batch()` semantics exactly (all-or-nothing for this fixed, known-
   * ahead-of-time list of statements; never a "read, then conditionally
   * write" multi-call transaction). See context.md's "No true
   * multi-repository-call transactions" note — that constraint is
   * inherent to this interface, not something either adapter works around.
   */
  batch(statements: readonly DatabaseStatement[]): Promise<void>;
}
