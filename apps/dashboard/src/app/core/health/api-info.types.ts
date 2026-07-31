import type { HealthCheckResponse } from "@imageryx/contracts";
import type {
  StorageProviderId,
  TransformationProviderId,
} from "@imageryx/providers";

/** Hand-mirrored from api-worker's `ServiceInfoResponse` (`src/routes/info.ts`) — no shared OpenAPI/codegen in this phase, see context.md. */
export interface UploadPolicyInfo {
  maxUploadSizeMb: number;
  assetRecoveryDays: number;
}

export interface ProcessingInfo {
  mode: "queue" | "inline-local";
  maxAttempts: number;
}

export interface ApiInfo extends HealthCheckResponse {
  product: string;
  storageProvider: StorageProviderId;
  transformationProvider: TransformationProviderId;
  deliveryUrl: string;
  uploadPolicy: UploadPolicyInfo;
  processing: ProcessingInfo;
  /** First 8 characters of the configured API key plus a fixed mask — never the complete key. */
  apiKeyPrefix: string;
}

export type ApiInfoState =
  | { status: "loading" }
  | { status: "success"; data: ApiInfo }
  | { status: "error"; message: string };
