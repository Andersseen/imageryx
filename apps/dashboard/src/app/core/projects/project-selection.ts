import type { ProjectSummary } from "@imageryx/sdk";

export const SELECTED_PROJECT_STORAGE_KEY = "imageryx.selectedProjectId";

/**
 * Picks which project should be active, given what the user asked for and what actually exists.
 *
 * Pure and separate from the service so the precedence rules are testable without a browser:
 * the awkward cases here (a remembered project that has since been deleted, a link to a project
 * that never existed) are exactly the ones that silently break if this logic lives inline.
 *
 * Precedence: an explicit request wins; then the last selection; then the project flagged
 * `isDefault`; then the first project. Any candidate that is not in `projects` is skipped rather
 * than honoured, so a stale id can never leave the dashboard pointed at nothing.
 */
export function resolveSelectedProjectId(
  projects: readonly ProjectSummary[],
  requestedId: string | null,
  rememberedId: string | null,
): string | null {
  if (projects.length === 0) return null;

  const exists = (id: string | null): boolean =>
    id !== null && projects.some((project) => project.id === id);

  if (exists(requestedId)) return requestedId;
  if (exists(rememberedId)) return rememberedId;

  const defaultProject = projects.find((project) => project.isDefault);
  return defaultProject ? defaultProject.id : (projects[0]?.id ?? null);
}

/** Sorts for the switcher: the default project first, then alphabetically — stable regardless of API order. */
export function sortProjectsForSwitcher(
  projects: readonly ProjectSummary[],
): ProjectSummary[] {
  return [...projects].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
