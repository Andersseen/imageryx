import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/**
 * Validates only the configuration this runtime component actually owns —
 * mirrors `packages/providers/src/config/provider-config.schema.ts`'s
 * `parseStorageConfig` split (validate only the half of the environment a
 * given caller reads, so an unrelated missing var can never take this
 * runtime down). The self-hosted Node process needs none of
 * `CLOUDFLARE_ACCOUNT_ID`/R2/Queues/Cloudinary/DevAuth to boot.
 */
const rawSelfHostedEnvSchema = z.object({
  RUNTIME: z.literal("node").default("node"),
  DATABASE_PROVIDER: z.literal("sqlite").default("sqlite"),
  DATABASE_PATH: z.string().min(1).default(".local/self-hosted/imageryx.db"),
  APP_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8790),
});

export class InvalidSelfHostedConfigError extends Error {}

export interface SelfHostedConfig {
  runtime: "node";
  databaseProvider: "sqlite";
  /** Always absolute — repo-root-relative paths (the local-dev default) are resolved against `repoRoot`. */
  databasePath: string;
  appEnv: "development" | "production";
  port: number;
}

export function parseSelfHostedConfig(
  env: Readonly<Record<string, string | undefined>>,
  repoRoot: string,
): SelfHostedConfig {
  const parsed = rawSelfHostedEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidSelfHostedConfigError(
      `invalid self-hosted runtime configuration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  const data = parsed.data;

  return {
    runtime: data.RUNTIME,
    databaseProvider: data.DATABASE_PROVIDER,
    databasePath: isAbsolute(data.DATABASE_PATH)
      ? data.DATABASE_PATH
      : resolve(repoRoot, data.DATABASE_PATH),
    appEnv: data.APP_ENV,
    port: data.PORT,
  };
}
