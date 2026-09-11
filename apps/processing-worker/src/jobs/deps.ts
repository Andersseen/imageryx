import type { ImagesBinding } from "@cloudflare/workers-types";
import type { DatabaseClient } from "@imageryx/database";
import type {
  CloudinaryCredentials,
  StorageProvider,
} from "@imageryx/providers";

export interface ProcessingDeps {
  db: DatabaseClient;
  storage: StorageProvider;
  maxAttempts: number;
  cloudinary: CloudinaryCredentials | null;
  images: ImagesBinding | null;
}
