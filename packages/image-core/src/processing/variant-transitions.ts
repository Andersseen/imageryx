import {
  VARIANT_STATUS_TRANSITIONS,
  type VariantStatus,
} from "@imageryx/contracts";
import { InvalidStateTransitionError } from "../errors/domain-errors";

export function canTransitionVariant(
  from: VariantStatus,
  to: VariantStatus,
): boolean {
  return VARIANT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidVariantTransition(
  from: VariantStatus,
  to: VariantStatus,
): void {
  if (!canTransitionVariant(from, to)) {
    throw new InvalidStateTransitionError(
      `cannot transition a variant from "${from}" to "${to}"`,
    );
  }
}
