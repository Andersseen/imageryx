import { describe, expect, it } from "vitest";
import { createApiKey, extractApiKeyPrefix, hashApiKey } from "./api-key";

describe("api key helpers", () => {
  it("generates dev and live keys with stored prefixes only", () => {
    const dev = createApiKey("dev");
    const live = createApiKey("live");

    expect(dev.key).toMatch(/^imgx_dev_[a-f0-9]{48}$/);
    expect(live.key).toMatch(/^imgx_live_[a-f0-9]{48}$/);
    expect(dev.prefix).toBe(dev.key.slice(0, 16));
    expect(live.prefix).toBe(live.key.slice(0, 16));
    expect(dev.key).not.toBe(createApiKey("dev").key);
  });

  it("hashes without preserving the complete key", async () => {
    const { key } = createApiKey("dev");
    const hash = await hashApiKey(key);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(key);
  });

  it("rejects malformed keys before database lookup", () => {
    expect(extractApiKeyPrefix("imgx_dev_local")).toBeNull();
    expect(extractApiKeyPrefix("Bearer imgx_dev_abc")).toBeNull();
  });
});
