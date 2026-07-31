import { Hono } from "hono";
import type { HealthCheckResponse } from "@imageryx/contracts";
import type {
  StorageProviderId,
  TransformationProviderId,
} from "@imageryx/providers";
import type { RequestIdVariables } from "../middleware/request-id";
import { VERSION } from "../version";

export interface UploadPolicyInfo {
  maxUploadSizeMb: number;
  assetRecoveryDays: number;
}

export interface ProcessingInfo {
  mode: "queue" | "inline-local";
  maxAttempts: number;
}

export interface ServiceInfoResponse extends HealthCheckResponse {
  product: "Imageryx";
  storageProvider: StorageProviderId;
  transformationProvider: TransformationProviderId;
  deliveryUrl: string;
  uploadPolicy: UploadPolicyInfo;
  processing: ProcessingInfo;
  /**
   * First 8 characters of the configured API key, followed by a fixed mask — never the complete
   * key. `imgx_dev_local` (14 chars) becomes `imgx_dev` + the mask, which is unambiguous enough
   * to confirm "yes, a key is configured, and it's the local default" without reconstructing it.
   */
  apiKeyPrefix: string;
}

const API_KEY_PREFIX_LENGTH = 8;
const API_KEY_MASK = "•".repeat(12);

export const infoRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

infoRoute.get("/", (c) => {
  const body: ServiceInfoResponse = {
    product: "Imageryx",
    service: "api-worker",
    status: "healthy",
    environment: c.env.APP_ENV,
    version: VERSION,
    timestamp: new Date().toISOString(),
    storageProvider: c.env.STORAGE_PROVIDER as StorageProviderId,
    transformationProvider: c.env
      .TRANSFORMATION_PROVIDER as TransformationProviderId,
    deliveryUrl: c.env.DELIVERY_URL,
    uploadPolicy: {
      maxUploadSizeMb: Number(c.env.MAX_UPLOAD_SIZE_MB),
      assetRecoveryDays: Number(c.env.ASSET_RECOVERY_DAYS),
    },
    processing: {
      mode: c.env.PROCESSING_MODE as "queue" | "inline-local",
      maxAttempts: Number(c.env.PROCESSING_MAX_ATTEMPTS),
    },
    apiKeyPrefix: `${c.env.IMAGERYX_API_KEY.slice(0, API_KEY_PREFIX_LENGTH)}${API_KEY_MASK}`,
  };

  return c.json(body);
});
