import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TemporaryStorageDirectory {
  path: string;
  cleanup: () => Promise<void>;
}

/** A fresh, uniquely-named directory under the OS temp dir, for `LocalStorageProvider` tests — never the repository itself. */
export async function createTemporaryStorageDirectory(): Promise<TemporaryStorageDirectory> {
  const path = await mkdtemp(join(tmpdir(), "imageryx-storage-"));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
