import type { HealthCheckResponse } from "@imageryx/contracts";
import type {
  StorageProviderId,
  TransformationProviderId,
} from "@imageryx/providers";

export interface ApiInfo extends HealthCheckResponse {
  product: string;
  storageProvider: StorageProviderId;
  transformationProvider: TransformationProviderId;
}

export type ApiInfoState =
  | { status: "loading" }
  | { status: "success"; data: ApiInfo }
  | { status: "error"; message: string };
