import type { D1Client } from "@imageryx/database";
import type { CloudinaryCredentials, StorageProvider } from "@imageryx/providers";

export interface ProcessingDeps {
  db: D1Client;
  storage: StorageProvider;
  maxAttempts: number;
  cloudinary: CloudinaryCredentials | null;
}
