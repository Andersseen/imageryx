import type { D1Database } from "@cloudflare/workers-types";
import type {
  DatabaseClient,
  DatabaseExecutionResult,
  DatabaseStatement,
} from "./client";

/**
 * Wraps a Cloudflare D1 binding as a runtime-independent `DatabaseClient`.
 * Cloudflare Worker entrypoints construct this once per request from their
 * own `DB` binding (`createD1DatabaseClient(env.DB)`) and pass the result
 * into repositories/services — nothing downstream of this file needs to
 * know it's talking to D1.
 */
export function createD1DatabaseClient(d1: D1Database): DatabaseClient {
  return {
    async query<T>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<readonly T[]> {
      const result = await d1
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return result.results;
    },

    async queryOne<T>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<T | null> {
      const row = await d1
        .prepare(sql)
        .bind(...params)
        .first<T>();
      return row ?? null;
    },

    async execute(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<DatabaseExecutionResult> {
      const result = await d1
        .prepare(sql)
        .bind(...params)
        .run();
      return { changes: result.meta?.changes ?? 0 };
    },

    async batch(statements: readonly DatabaseStatement[]): Promise<void> {
      if (statements.length === 0) return;
      await d1.batch(
        statements.map((statement) =>
          d1.prepare(statement.sql).bind(...(statement.params ?? [])),
        ),
      );
    },
  };
}
