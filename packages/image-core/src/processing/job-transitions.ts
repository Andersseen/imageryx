import {
  PROCESSING_JOB_STATUS_TRANSITIONS,
  type ProcessingJobStatus,
} from "@imageryx/contracts";
import { InvalidStateTransitionError } from "../errors/domain-errors";

export function canTransitionProcessingJob(
  from: ProcessingJobStatus,
  to: ProcessingJobStatus,
): boolean {
  return PROCESSING_JOB_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidProcessingJobTransition(
  from: ProcessingJobStatus,
  to: ProcessingJobStatus,
): void {
  if (!canTransitionProcessingJob(from, to)) {
    throw new InvalidStateTransitionError(
      `cannot transition a processing job from "${from}" to "${to}"`,
    );
  }
}
