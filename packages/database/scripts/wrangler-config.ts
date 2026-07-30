import { readFileSync } from "node:fs";

/**
 * Minimal JSONC reader: strips `//` line comments then `JSON.parse`s the
 * rest. `wrangler.jsonc` files in this repo only ever use line comments
 * (no block comments, no comments inside string values), so this is
 * deliberately not a general JSONC parser.
 */
export function readJsonc(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf-8");
  const withoutComments = raw
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");
  return JSON.parse(withoutComments) as Record<string, unknown>;
}

export interface ApiWorkerD1Config {
  binding: string;
  databaseId: string;
}

export function readApiWorkerD1Config(
  wranglerJsoncPath: string,
): ApiWorkerD1Config {
  const config = readJsonc(wranglerJsoncPath);
  const d1Databases = config["d1_databases"];
  if (!Array.isArray(d1Databases) || d1Databases.length === 0) {
    throw new Error(`no d1_databases entry found in ${wranglerJsoncPath}`);
  }
  const [entry] = d1Databases as [Record<string, unknown>];
  const binding = entry["binding"];
  const databaseId = entry["database_id"];
  if (typeof binding !== "string" || typeof databaseId !== "string") {
    throw new Error(
      `d1_databases[0] in ${wranglerJsoncPath} is missing "binding" or "database_id"`,
    );
  }
  return { binding, databaseId };
}

export function readApiWorkerLocalStoragePath(
  wranglerJsoncPath: string,
): string {
  const config = readJsonc(wranglerJsoncPath);
  const vars = config["vars"];
  const path = (vars as Record<string, unknown> | undefined)?.[
    "LOCAL_STORAGE_PATH"
  ];
  if (typeof path !== "string") {
    throw new Error(
      `vars.LOCAL_STORAGE_PATH not found in ${wranglerJsoncPath}`,
    );
  }
  return path;
}
