import { PresetRepository, ProcessingJobRepository } from "@imageryx/database";

/** Small per-project scan (JSON `input` isn't indexable) — pending job counts are small in this phase, so this stays a single bulk query plus an in-memory filter rather than N queries. */
export async function hasJobsDependingOnPreset(db: Env["DB"], presetId: string): Promise<boolean> {
  const preset = await new PresetRepository(db).findById(presetId);
  if (!preset) return false;

  const jobs = await new ProcessingJobRepository(db).list({
    projectId: preset.projectId,
    type: "generate-variant",
  });

  return jobs.some(
    (job) =>
      (job.status === "queued" || job.status === "processing") &&
      job.input.type === "generate-variant" &&
      job.input.presetId === presetId,
  );
}
