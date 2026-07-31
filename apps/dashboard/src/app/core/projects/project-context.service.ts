import { computed, inject, Injectable, signal } from "@angular/core";
import type { Folder, ProjectSummary } from "@imageryx/sdk";
import { AsyncStore } from "../api/async-store";
import { IMAGERYX_CLIENT } from "../sdk/imageryx-client.token";
import {
  resolveSelectedProjectId,
  SELECTED_PROJECT_STORAGE_KEY,
  sortProjectsForSwitcher,
} from "./project-selection";

/**
 * Owns "which project am I looking at" for the whole dashboard, plus that project's folders and
 * tags — the two lists nearly every screen needs to render a filter or a form.
 *
 * Provided in root so the project list is fetched once per session rather than once per page,
 * and so switching projects in the topbar is immediately visible to every route without an
 * event bus. Folders and tags are loaded per project and cached until the selection changes or
 * something invalidates them.
 */
@Injectable({ providedIn: "root" })
export class ProjectContextService {
  private readonly client = inject(IMAGERYX_CLIENT);

  private readonly projectsStore = new AsyncStore<ProjectSummary[]>();
  private readonly foldersStore = new AsyncStore<Folder[]>();
  private readonly tagsStore = new AsyncStore<string[]>();

  private readonly selectedId = signal<string | null>(null);
  /** Guards against a second concurrent bootstrap when two routes activate at once. */
  private bootstrapped: Promise<void> | null = null;

  readonly projects = computed(() => this.projectsStore.data() ?? []);
  readonly orderedProjects = computed(() =>
    sortProjectsForSwitcher(this.projects()),
  );
  readonly projectsLoading = this.projectsStore.isLoading;
  readonly projectsError = this.projectsStore.error;
  readonly projectsLoaded = this.projectsStore.hasData;

  readonly selectedProjectId = this.selectedId.asReadonly();
  readonly selectedProject = computed(
    () =>
      this.projects().find((project) => project.id === this.selectedId()) ??
      null,
  );
  /** True only once loading has finished and there genuinely are no projects — the real empty state. */
  readonly hasNoProjects = computed(
    () => this.projectsStore.hasData() && this.projects().length === 0,
  );

  readonly folders = computed(() => this.foldersStore.data() ?? []);
  readonly foldersLoading = this.foldersStore.isLoading;
  readonly tags = computed(() => this.tagsStore.data() ?? []);

  /**
   * Loads the project list once and settles on a selection. Safe to call from every page's
   * constructor: repeat calls return the same in-flight or completed promise rather than
   * refetching.
   */
  async ensureLoaded(requestedProjectId?: string | null): Promise<void> {
    if (this.bootstrapped) {
      await this.bootstrapped;
      if (requestedProjectId) this.select(requestedProjectId);
      return;
    }
    this.bootstrapped = this.loadProjects(requestedProjectId ?? null);
    await this.bootstrapped;
  }

  /** Refetches the project list, keeping the current selection if it still exists. */
  async reloadProjects(): Promise<void> {
    await this.loadProjects(this.selectedId());
  }

  private async loadProjects(requestedProjectId: string | null): Promise<void> {
    const loaded = await this.projectsStore.load(async () => {
      const response = await this.client.projects.list({ pageSize: 100 });
      return response.items;
    });
    if (!loaded) return;

    const next = resolveSelectedProjectId(
      loaded,
      requestedProjectId,
      this.readRememberedId(),
    );
    if (next !== this.selectedId()) {
      this.selectedId.set(next);
      this.rememberId(next);
      this.resetProjectScopedState();
    }
    if (next) void this.loadProjectScopedData(next);
  }

  select(projectId: string | null): void {
    if (projectId === this.selectedId()) return;
    const exists =
      projectId === null || this.projects().some((p) => p.id === projectId);
    if (!exists) return;

    this.selectedId.set(projectId);
    this.rememberId(projectId);
    this.resetProjectScopedState();
    if (projectId) void this.loadProjectScopedData(projectId);
  }

  /**
   * Applies a mutation's own response to the cached list instead of refetching everything —
   * renaming one project should not re-download all of them plus their aggregate stats.
   */
  upsertProject(project: ProjectSummary): void {
    this.projectsStore.patch((current) => {
      const index = current.findIndex((existing) => existing.id === project.id);
      if (index === -1) return [...current, project];
      const next = [...current];
      next[index] = project;
      return next;
    });
  }

  removeProject(projectId: string): void {
    this.projectsStore.patch((current) =>
      current.filter((p) => p.id !== projectId),
    );
    if (this.selectedId() === projectId) {
      const fallback = resolveSelectedProjectId(this.projects(), null, null);
      this.selectedId.set(fallback);
      this.rememberId(fallback);
      this.resetProjectScopedState();
      if (fallback) void this.loadProjectScopedData(fallback);
    }
  }

  /** Called after a folder or tag is created elsewhere, so the filter lists pick it up. */
  async refreshProjectScopedData(): Promise<void> {
    const projectId = this.selectedId();
    if (projectId) await this.loadProjectScopedData(projectId);
  }

  private async loadProjectScopedData(projectId: string): Promise<void> {
    await Promise.all([
      this.foldersStore.load(
        async () => (await this.client.folders.list(projectId)).items,
      ),
      this.tagsStore.load(async () =>
        (await this.client.tags.list(projectId)).items
          .map((tag) => tag.name)
          .sort(),
      ),
    ]);
  }

  private resetProjectScopedState(): void {
    this.foldersStore.reset();
    this.tagsStore.reset();
  }

  /**
   * `localStorage` access is wrapped because it throws outright in a few real configurations
   * (Safari private mode, cookies-blocked, some embedded webviews). A remembered selection is a
   * convenience — losing it must never take the dashboard down with it.
   */
  private readRememberedId(): string | null {
    try {
      return (
        globalThis.localStorage?.getItem(SELECTED_PROJECT_STORAGE_KEY) ?? null
      );
    } catch {
      return null;
    }
  }

  private rememberId(projectId: string | null): void {
    try {
      if (projectId)
        globalThis.localStorage?.setItem(
          SELECTED_PROJECT_STORAGE_KEY,
          projectId,
        );
      else globalThis.localStorage?.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    } catch {
      // Non-fatal: the selection still works for this session, it just will not be restored.
    }
  }
}
