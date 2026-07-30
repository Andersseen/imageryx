import {
  IMAGE_OPERATION_TYPES,
  MAX_DIMENSION,
  MAX_OPERATIONS_PER_PRESET,
  MIN_DIMENSION,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "@imageryx/contracts";
import { FILENAME_MAX_LENGTH } from "@imageryx/image-core";
import { Hono } from "hono";
import type { RequestIdVariables } from "../../middleware/request-id";

export const domainDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

/**
 * Reports provider-independent domain constants only — no database or
 * provider access, so this always succeeds and never leaks anything
 * environment-specific.
 */
domainDiagnosticsRoute.get("/", (c) =>
  c.json({
    supportedMimeTypes: SUPPORTED_IMAGE_MIME_TYPES,
    supportedExtensions: SUPPORTED_IMAGE_EXTENSIONS,
    supportedOperations: IMAGE_OPERATION_TYPES,
    dimensionLimits: { min: MIN_DIMENSION, max: MAX_DIMENSION },
    maxOperationsPerPreset: MAX_OPERATIONS_PER_PRESET,
    filenameMaxLength: FILENAME_MAX_LENGTH,
  }),
);
