export interface ProductionSecretCheck {
  name: string;
  value: string | undefined;
  unsafeDefaultValue: string;
}

export class UnsafeProductionConfigError extends Error {}

/**
 * Guards against exactly the failure mode found in this repo once already:
 * a real secret left equal to its committed local-dev default
 * (`imgx_dev_local`, `replace-with-local-development-secret`) when actually
 * deployed. A no-op outside `appEnv === "production"` — local/dev/preview
 * environments are expected to run on those defaults.
 */
export function assertSafeProductionSecrets(
  appEnv: string,
  checks: readonly ProductionSecretCheck[],
): void {
  if (appEnv !== "production") return;

  const problems = checks
    .filter((check) => !check.value || check.value === check.unsafeDefaultValue)
    .map((check) =>
      check.value
        ? `${check.name} is still set to its local-development default value`
        : `${check.name} is not set`,
    );

  if (problems.length > 0) {
    throw new UnsafeProductionConfigError(
      `Unsafe production configuration: ${problems.join("; ")}.`,
    );
  }
}
