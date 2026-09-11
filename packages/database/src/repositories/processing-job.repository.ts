import {
  type ProcessingJob,
  processingJobInputSchema,
  processingJobResultSchema,
  processingJobSchema,
} from "@imageryx/contracts";
import type { DatabaseClient, DatabaseStatement } from "../client";
import { generateId, nowIso } from "../ids";

interface ProcessingJobRow {
  id: string;
  project_id: string;
  asset_id: string | null;
  type: string;
  provider: string | null;
  status: string;
  input: string;
  result: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
}

function mapRow(row: ProcessingJobRow): ProcessingJob {
  return processingJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    type: row.type,
    provider: row.provider,
    status: row.status,
    input: processingJobInputSchema.parse(JSON.parse(row.input)),
    result:
      row.result === null
        ? null
        : processingJobResultSchema.parse(JSON.parse(row.result)),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  });
}

export interface CreateProcessingJobRow {
  projectId: string;
  assetId?: string | null;
  type: ProcessingJob["type"];
  provider?: string | null;
  input: ProcessingJob["input"];
}

export interface UpdateProcessingJobRow {
  status?: ProcessingJob["status"];
  result?: ProcessingJob["result"];
  errorCode?: string | null;
  errorMessage?: string | null;
  attempts?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
}

export interface ListProcessingJobsFilter {
  projectId: string;
  assetId?: string;
  type?: ProcessingJob["type"];
  status?: ProcessingJob["status"];
}

/** Shared by `list` and `listPaginated` so the two never drift out of sync with each other. */
function buildWhereClause(filter: ListProcessingJobsFilter): {
  sql: string;
  params: unknown[];
} {
  const conditions = ["project_id = ?"];
  const params: unknown[] = [filter.projectId];

  if (filter.assetId) {
    conditions.push("asset_id = ?");
    params.push(filter.assetId);
  }
  if (filter.type) {
    conditions.push("type = ?");
    params.push(filter.type);
  }
  if (filter.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }

  return { sql: conditions.join(" AND "), params };
}

export class ProcessingJobRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filter: ListProcessingJobsFilter): Promise<ProcessingJob[]> {
    const where = buildWhereClause(filter);
    const results = await this.db.query<ProcessingJobRow>(
      `SELECT * FROM processing_jobs WHERE ${where.sql} ORDER BY created_at DESC`,
      where.params,
    );
    return results.map(mapRow);
  }

  /**
   * SQL-backed pagination — used by `GET /v1/processing-jobs` so the route
   * never loads every job for a project into memory just to slice a page
   * off the front. `list()` above stays as-is for callers that are
   * naturally bounded already (e.g. one asset's own job history).
   */
  async listPaginated(
    filter: ListProcessingJobsFilter,
    page: number,
    pageSize: number,
  ): Promise<{ items: ProcessingJob[]; total: number }> {
    const where = buildWhereClause(filter);
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.db.query<ProcessingJobRow>(
        `SELECT * FROM processing_jobs WHERE ${where.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...where.params, pageSize, offset],
      ),
      this.db.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM processing_jobs WHERE ${where.sql}`,
        where.params,
      ),
    ]);

    return { items: rows.map(mapRow), total: countRow?.total ?? 0 };
  }

  async findById(id: string): Promise<ProcessingJob | null> {
    const row = await this.db.queryOne<ProcessingJobRow>(
      "SELECT * FROM processing_jobs WHERE id = ?",
      [id],
    );
    return row ? mapRow(row) : null;
  }

  /** Every project's queued jobs, oldest first — used by the local `processing:run-local` drain tool and by any future automatic sweep, not by normal request handling. */
  async listQueued(limit = 100): Promise<ProcessingJob[]> {
    const results = await this.db.query<ProcessingJobRow>(
      "SELECT * FROM processing_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?",
      [limit],
    );
    return results.map(mapRow);
  }

  async countByStatus(): Promise<Map<string, number>> {
    const results = await this.db.query<{ status: string; count: number }>(
      "SELECT status, COUNT(*) as count FROM processing_jobs GROUP BY status",
    );
    const map = new Map<string, number>();
    for (const row of results) map.set(row.status, row.count);
    return map;
  }

  /** Unexecuted counterpart to `create()`, for combining with another repository's statement in a `db.batch()` call (e.g. `VariantPersistenceService`). */
  buildInsertStatement(
    id: string,
    input: CreateProcessingJobRow,
    timestamp: string,
  ): DatabaseStatement {
    return {
      sql: "INSERT INTO processing_jobs (id, project_id, asset_id, type, provider, status, input, result, error_code, error_message, attempts, created_at, started_at, completed_at, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, NULL, NULL, NULL)",
      params: [
        id,
        input.projectId,
        input.assetId ?? null,
        input.type,
        input.provider ?? null,
        "queued",
        JSON.stringify(input.input),
        timestamp,
      ],
    };
  }

  async create(input: CreateProcessingJobRow): Promise<ProcessingJob> {
    const id = generateId();
    const timestamp = nowIso();
    const statement = this.buildInsertStatement(id, input, timestamp);
    await this.db.execute(statement.sql, statement.params);

    return {
      id,
      projectId: input.projectId,
      assetId: input.assetId ?? null,
      type: input.type,
      provider: input.provider ?? null,
      status: "queued",
      input: input.input,
      result: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      createdAt: timestamp,
      startedAt: null,
      completedAt: null,
      failedAt: null,
    };
  }

  async update(
    id: string,
    input: UpdateProcessingJobRow,
  ): Promise<ProcessingJob | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged = {
      status: input.status ?? existing.status,
      result: input.result !== undefined ? input.result : existing.result,
      errorCode:
        input.errorCode !== undefined ? input.errorCode : existing.errorCode,
      errorMessage:
        input.errorMessage !== undefined
          ? input.errorMessage
          : existing.errorMessage,
      attempts: input.attempts ?? existing.attempts,
      startedAt:
        input.startedAt !== undefined ? input.startedAt : existing.startedAt,
      completedAt:
        input.completedAt !== undefined
          ? input.completedAt
          : existing.completedAt,
      failedAt:
        input.failedAt !== undefined ? input.failedAt : existing.failedAt,
    };

    await this.db.execute(
      "UPDATE processing_jobs SET status = ?, result = ?, error_code = ?, error_message = ?, attempts = ?, started_at = ?, completed_at = ?, failed_at = ? WHERE id = ?",
      [
        merged.status,
        merged.result === null ? null : JSON.stringify(merged.result),
        merged.errorCode,
        merged.errorMessage,
        merged.attempts,
        merged.startedAt,
        merged.completedAt,
        merged.failedAt,
        id,
      ],
    );

    return { ...existing, ...merged };
  }
}
