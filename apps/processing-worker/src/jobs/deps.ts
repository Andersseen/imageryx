import type { D1Client } from "@imageryx/database";
import type { StorageProvider } from "@imageryx/providers";

export interface ProcessingDeps {
  db: D1Client;
  storage: StorageProvider;
  maxAttempts: number;
}
