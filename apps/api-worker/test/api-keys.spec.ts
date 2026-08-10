import { ApiKeyRepository } from "@imageryx/database";
import { createApiKey, hashApiKey } from "@imageryx/image-core";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("database-backed API keys", () => {
  it("creates a key, returns it once, and stores only its hash", async () => {
    const response = await SELF.fetch("https://example.com/v1/api-keys", {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ name: "CI" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      key: string;
      prefix: string;
      name: string;
    };
    expect(body.key).toMatch(/^imgx_dev_[a-f0-9]{48}$/);
    expect(body.prefix).toBe(body.key.slice(0, 16));
    expect(body.name).toBe("CI");

    const stored = await new ApiKeyRepository(env.DB).findActiveByPrefix(
      body.prefix,
    );
    expect(stored?.hashedSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.hashedSecret).not.toContain(body.key);

    const listResponse = await SELF.fetch("https://example.com/v1/api-keys", {
      headers: authHeaders(),
    });
    const list = (await listResponse.json()) as {
      items: unknown[];
      key?: string;
    };
    expect(JSON.stringify(list)).not.toContain(body.key);
  });

  it("accepts a stored key and updates last_used_at", async () => {
    const generated = createApiKey("dev");
    const record = await new ApiKeyRepository(env.DB).create({
      name: "SDK",
      prefix: generated.prefix,
      hashedSecret: await hashApiKey(generated.key),
    });

    const response = await SELF.fetch("https://example.com/v1/projects", {
      headers: { Authorization: `Bearer ${generated.key}` },
    });

    expect(response.status).toBe(200);
    const used = await new ApiKeyRepository(env.DB).findActiveByPrefix(
      record.prefix,
    );
    expect(used?.lastUsedAt).toBeTruthy();
  });

  it("rejects invalid and revoked database keys", async () => {
    const generated = createApiKey("dev");
    const repository = new ApiKeyRepository(env.DB);
    const record = await repository.create({
      name: "Revoked",
      prefix: generated.prefix,
      hashedSecret: await hashApiKey(generated.key),
    });
    await repository.revoke(record.id);

    const revoked = await SELF.fetch("https://example.com/v1/projects", {
      headers: { Authorization: `Bearer ${generated.key}` },
    });
    const invalid = await SELF.fetch("https://example.com/v1/projects", {
      headers: {
        Authorization:
          "Bearer imgx_dev_000000000000000000000000000000000000000000000000",
      },
    });

    expect(revoked.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("keeps the legacy static key working as a migration fallback", async () => {
    const response = await SELF.fetch("https://example.com/v1/projects", {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
  });
});
