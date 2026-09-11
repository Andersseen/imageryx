import type { DatabaseClient } from "../client";
import { generateId, nowIso } from "../ids";

export interface ApiKeyRecord {
  id: string;
  name: string | null;
  prefix: string;
  hashedSecret: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyRow {
  id: string;
  prefix: string;
  hashed_secret: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function mapRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    hashedSecret: row.hashed_secret,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export class ApiKeyRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(): Promise<ApiKeyRecord[]> {
    const results = await this.db.query<ApiKeyRow>(
      "SELECT * FROM api_keys ORDER BY revoked_at IS NOT NULL ASC, created_at DESC",
    );
    return results.map(mapRow);
  }

  async findActiveByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const row = await this.db.queryOne<ApiKeyRow>(
      "SELECT * FROM api_keys WHERE prefix = ? AND revoked_at IS NULL",
      [prefix],
    );
    return row ? mapRow(row) : null;
  }

  async create(input: {
    name?: string | null;
    prefix: string;
    hashedSecret: string;
  }): Promise<ApiKeyRecord> {
    const id = generateId();
    const timestamp = nowIso();
    await this.db.execute(
      "INSERT INTO api_keys (id, prefix, hashed_secret, name, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)",
      [id, input.prefix, input.hashedSecret, input.name ?? null, timestamp],
    );

    return {
      id,
      name: input.name ?? null,
      prefix: input.prefix,
      hashedSecret: input.hashedSecret,
      createdAt: timestamp,
      lastUsedAt: null,
      revokedAt: null,
    };
  }

  async markUsed(id: string): Promise<void> {
    await this.db.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [
      nowIso(),
      id,
    ]);
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.db.execute(
      "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      [nowIso(), id],
    );
    return result.changes > 0;
  }
}
