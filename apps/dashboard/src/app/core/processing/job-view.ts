import type {
  ProcessingJob,
  ProcessingJobInput,
  ProcessingJobResult,
  ProcessingJobType,
} from "@imageryx/contracts";
import { formatBytes } from "../format/format";

const TYPE_LABELS: Record<ProcessingJobType, string> = {
  "inspect-metadata": "Inspect metadata",
  "generate-variant": "Generate variant",
  "extract-placeholder": "Extract placeholder",
  "strip-metadata": "Strip metadata",
  "copy-provider-result": "Copy provider result",
  "delete-object": "Delete object",
  "batch-operation": "Batch operation",
};

export function describeJobType(type: ProcessingJobType): string {
  return TYPE_LABELS[type];
}

/**
 * One plain sentence describing what the job was asked to do — the primary, always-visible
 * summary. The full typed input is still available (the detail page's expandable "raw job data"
 * section), this is just never it: a `delete-object` input's only field is a storage key, which
 * stays out of this sentence the same way the asset info panel never prints one.
 */
export function describeJobInput(input: ProcessingJobInput): string {
  switch (input.type) {
    case "inspect-metadata":
      return "Inspect the asset's metadata.";
    case "generate-variant":
      return `Generate a variant${input.persist ? "" : " (not persisted)"}.`;
    case "extract-placeholder":
      return "Extract a low-resolution placeholder.";
    case "strip-metadata":
      return `Strip metadata (${input.mode.replace("-", " ")}).`;
    case "copy-provider-result":
      return "Copy a provider-generated result into a variant.";
    case "delete-object":
      return "Delete a stored object.";
    case "batch-operation":
      return `Apply a preset to ${input.assetIds.length} asset${input.assetIds.length === 1 ? "" : "s"}.`;
  }
}

/** `null` when the job hasn't produced a result yet (queued/processing) or never does (failed/cancelled). */
export function describeJobResult(
  result: ProcessingJobResult | null,
): string | null {
  if (!result) return null;
  switch (result.type) {
    case "inspect-metadata": {
      const dims =
        result.width && result.height
          ? `${result.width} × ${result.height}`
          : "unknown dimensions";
      const alpha =
        result.hasAlpha === null
          ? ""
          : result.hasAlpha
            ? ", has alpha"
            : ", no alpha";
      return `Inspected — ${dims}${alpha}.`;
    }
    case "generate-variant": {
      const dims =
        result.width && result.height
          ? ` at ${result.width} × ${result.height}`
          : "";
      const size =
        result.sizeBytes !== null ? ` (${formatBytes(result.sizeBytes)})` : "";
      return `Variant generated${dims}${size}.`;
    }
    case "extract-placeholder":
      return "Placeholder extracted.";
    case "strip-metadata":
      return "Metadata stripped.";
    case "copy-provider-result":
      return "Provider result copied.";
    case "delete-object":
      return result.deleted ? "Object deleted." : "Object was already absent.";
    case "batch-operation": {
      const { processedCount, failedCount } = result;
      return failedCount > 0
        ? `${processedCount} processed, ${failedCount} failed.`
        : `${processedCount} processed.`;
    }
  }
}

export interface JobView {
  job: ProcessingJob;
  typeLabel: string;
  inputSummary: string;
  resultSummary: string | null;
}

export function toJobView(job: ProcessingJob): JobView {
  return {
    job,
    typeLabel: describeJobType(job.type),
    inputSummary: describeJobInput(job.input),
    resultSummary: describeJobResult(job.result),
  };
}
