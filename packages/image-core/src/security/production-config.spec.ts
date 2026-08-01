import { describe, expect, it } from "vitest";
import {
  assertSafeProductionSecrets,
  UnsafeProductionConfigError,
} from "./production-config";

const checks = [
  { name: "IMAGERYX_API_KEY", value: "imgx_dev_local", unsafeDefaultValue: "imgx_dev_local" },
  {
    name: "DOWNLOAD_SIGNING_SECRET",
    value: "replace-with-local-development-secret",
    unsafeDefaultValue: "replace-with-local-development-secret",
  },
];

describe("assertSafeProductionSecrets", () => {
  it("does nothing outside production", () => {
    expect(() => assertSafeProductionSecrets("development", checks)).not.toThrow();
  });

  it("throws when a secret still equals its dev-default value in production", () => {
    expect(() => assertSafeProductionSecrets("production", checks)).toThrow(
      UnsafeProductionConfigError,
    );
  });

  it("throws when a required secret is missing in production", () => {
    const missing = [
      { name: "IMAGERYX_API_KEY", value: undefined, unsafeDefaultValue: "imgx_dev_local" },
    ];
    expect(() => assertSafeProductionSecrets("production", missing)).toThrow(
      /IMAGERYX_API_KEY is not set/,
    );
  });

  it("lists every failing check, not just the first", () => {
    expect(() => assertSafeProductionSecrets("production", checks)).toThrow(
      /IMAGERYX_API_KEY.*DOWNLOAD_SIGNING_SECRET/s,
    );
  });

  it("does not throw when every secret is set to a real, non-default value", () => {
    const safe = [
      { name: "IMAGERYX_API_KEY", value: "a-real-generated-key", unsafeDefaultValue: "imgx_dev_local" },
      {
        name: "DOWNLOAD_SIGNING_SECRET",
        value: "a-real-generated-secret",
        unsafeDefaultValue: "replace-with-local-development-secret",
      },
    ];
    expect(() => assertSafeProductionSecrets("production", safe)).not.toThrow();
  });
});
