import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ImgyxImage } from "@imageryx/angular";
import type {
  AssetDetails,
  Folder,
  ImagePreset,
  ImageVariant,
  ProcessingJob,
  ProjectSummary,
} from "@imageryx/sdk";
import { ImageryxApiError } from "@imageryx/sdk";
import { VoltBadge, VoltButton, VoltSeparator } from "@voltui/components";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

type StepState = "idle" | "busy" | "done" | "error";

@Component({
  selector: "ix-dev-flow-page",
  standalone: true,
  imports: [VoltBadge, VoltButton, VoltSeparator, ImgyxImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-8 py-8">
      <section class="flex flex-col gap-2">
        <volt-badge variant="outline">Development only</volt-badge>
        <h1 class="text-2xl font-semibold text-foreground">Backend dev flow</h1>
        <p class="max-w-2xl text-muted-foreground">
          Exercises the real upload &rarr; processing &rarr; variant &rarr;
          delivery pipeline against the local API through the server-side proxy
          (never the API key directly in this page's code — see README's
          "Authentication" section). This is not the final asset library UI
          (Phase 4).
        </p>
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">
          1. Project &amp; folder
        </h2>
        @if (projectsState() === "error") {
          <p class="text-sm text-destructive">{{ errorMessage() }}</p>
        }
        <div class="flex flex-wrap gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted-foreground">Project</span>
            <select
              class="rounded-md border border-border bg-card px-3 py-2 text-foreground"
              [value]="selectedProjectId() ?? ''"
              (change)="onProjectChange($any($event.target).value)"
            >
              <option value="" disabled>Select a project&hellip;</option>
              @for (project of projects(); track project.id) {
                <option [value]="project.id">
                  {{ project.name }} ({{ project.slug }})
                </option>
              }
            </select>
          </label>

          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted-foreground">Folder (optional)</span>
            <select
              class="rounded-md border border-border bg-card px-3 py-2 text-foreground"
              [value]="selectedFolderId() ?? ''"
              [disabled]="!selectedProjectId()"
              (change)="onFolderChange($any($event.target).value)"
            >
              <option value="">(root)</option>
              @for (folder of folders(); track folder.id) {
                <option [value]="folder.id">{{ folder.path }}</option>
              }
            </select>
          </label>
        </div>
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">
          2. Upload an image
        </h2>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
          aria-label="Select an image file to upload"
          (change)="onFileSelected($any($event.target).files)"
        />
        <div class="flex items-center gap-3">
          <volt-button
            variant="solid"
            [disabled]="!canUpload()"
            (click)="upload()"
          >
            Upload
          </volt-button>
          @switch (uploadState()) {
            @case ("busy") {
              <span class="text-sm text-muted-foreground"
                >Uploading&hellip;</span
              >
            }
            @case ("error") {
              <span class="text-sm text-destructive">{{ errorMessage() }}</span>
            }
            @case ("done") {
              <span class="text-sm text-muted-foreground">
                Asset ID: <code>{{ asset()?.id }}</code>
              </span>
            }
          }
        </div>

        @if (asset(); as currentAsset) {
          <div class="flex items-center gap-3 text-sm">
            <span class="text-muted-foreground">Processing status:</span>
            <volt-badge
              [variant]="statusBadgeVariant(currentAsset.processingStatus)"
            >
              {{ currentAsset.processingStatus }}
            </volt-badge>
            <volt-button variant="outline" size="sm" (click)="refreshAsset()">
              Refresh
            </volt-button>
          </div>
        }
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">
          3. Request a preset variant
        </h2>
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted-foreground">Preset</span>
            <select
              class="rounded-md border border-border bg-card px-3 py-2 text-foreground"
              [value]="selectedPresetId() ?? ''"
              (change)="selectedPresetId.set($any($event.target).value || null)"
            >
              <option value="" disabled>Select a preset&hellip;</option>
              @for (preset of presets(); track preset.id) {
                <option [value]="preset.id">
                  {{ preset.name }} ({{ preset.slug }})
                </option>
              }
            </select>
          </label>
          <volt-button
            variant="solid"
            [disabled]="!canGenerateVariant()"
            (click)="generateVariant()"
          >
            Generate variant
          </volt-button>
          @switch (variantState()) {
            @case ("busy") {
              <span class="text-sm text-muted-foreground"
                >Processing&hellip;</span
              >
            }
            @case ("error") {
              <span class="text-sm text-destructive">{{ errorMessage() }}</span>
            }
          }
        </div>
        @if (variant(); as currentVariant) {
          <p class="text-sm text-muted-foreground">
            Variant status:
            <volt-badge variant="secondary">{{
              currentVariant.status
            }}</volt-badge>
            @if (jobStatus()) {
              &middot; job: <code>{{ jobStatus() }}</code>
            }
          </p>
        }
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">4. Delivery</h2>
        @if (originalUrl(); as url) {
          <p class="break-all text-sm text-muted-foreground">
            Original: <code>{{ url }}</code>
          </p>
        }
        @if (presetDeliveryUrl(); as url) {
          <p class="break-all text-sm text-muted-foreground">
            Preset: <code>{{ url }}</code>
          </p>
        }

        @if (asset(); as currentAsset) {
          @if (currentAsset.project) {
            <div class="rounded-lg border border-border bg-card p-4">
              <imgyx-image
                [project]="currentAsset.project.slug"
                [asset]="currentAsset.path"
                [preset]="readyPresetSlug() ?? undefined"
                [deliveryBaseUrl]="env.deliveryUrl"
                alt="Uploaded asset preview"
                [width]="320"
                [height]="240"
                loading="eager"
              />
            </div>
          }
        }
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">5. Snippets</h2>
        @if (htmlSnippet(); as snippet) {
          <pre
            class="overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
            >{{ snippet }}</pre
          >
        }
        @if (angularSnippet(); as snippet) {
          <pre
            class="overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
            >{{ snippet }}</pre
          >
        }
      </section>
    </div>
  `,
})
export default class DevFlowPage {
  private readonly client = inject(IMAGERYX_CLIENT);
  protected readonly env = inject(DASHBOARD_ENV);

  protected readonly projects = signal<ProjectSummary[]>([]);
  protected readonly projectsState = signal<StepState>("idle");
  protected readonly folders = signal<Folder[]>([]);
  protected readonly presets = signal<ImagePreset[]>([]);

  protected readonly selectedProjectId = signal<string | null>(null);
  protected readonly selectedFolderId = signal<string | null>(null);
  protected readonly selectedPresetId = signal<string | null>(null);
  protected readonly selectedFile = signal<File | null>(null);

  protected readonly uploadState = signal<StepState>("idle");
  protected readonly variantState = signal<StepState>("idle");
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly asset = signal<AssetDetails | null>(null);
  protected readonly variant = signal<ImageVariant | null>(null);
  protected readonly jobStatus = signal<string | null>(null);

  protected readonly canUpload = computed(
    () =>
      !!this.selectedProjectId() &&
      !!this.selectedFile() &&
      this.uploadState() !== "busy",
  );
  protected readonly canGenerateVariant = computed(
    () =>
      !!this.asset() &&
      this.asset()?.processingStatus === "ready" &&
      !!this.selectedPresetId() &&
      this.variantState() !== "busy",
  );

  protected readonly readyPresetSlug = computed(() => {
    const currentVariant = this.variant();
    const preset = this.presets().find(
      (p) => p.id === currentVariant?.presetId,
    );
    return currentVariant?.status === "ready" ? (preset?.slug ?? null) : null;
  });

  protected readonly originalUrl = computed(() => {
    const currentAsset = this.asset();
    if (!currentAsset?.project) return null;
    return this.client.delivery.originalUrl(
      currentAsset.project.slug,
      currentAsset.path,
    );
  });

  protected readonly presetDeliveryUrl = computed(() => {
    const currentAsset = this.asset();
    const presetSlug = this.readyPresetSlug();
    if (!currentAsset?.project || !presetSlug) return null;
    return this.client.delivery.presetUrl(
      currentAsset.project.slug,
      currentAsset.path,
      presetSlug,
    );
  });

  protected readonly htmlSnippet = computed(() => {
    const currentAsset = this.asset();
    if (!currentAsset?.project) return null;
    return this.client.snippets.html({
      project: currentAsset.project.slug,
      asset: currentAsset.path,
      preset: this.readyPresetSlug() ?? undefined,
      alt: currentAsset.name,
    });
  });

  protected readonly angularSnippet = computed(() => {
    const currentAsset = this.asset();
    if (!currentAsset?.project) return null;
    return this.client.snippets.angular({
      project: currentAsset.project.slug,
      asset: currentAsset.path,
      preset: this.readyPresetSlug() ?? undefined,
      alt: currentAsset.name,
    });
  });

  constructor() {
    void this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    this.projectsState.set("busy");
    try {
      const response = await this.client.projects.list({ pageSize: 100 });
      this.projects.set(response.items);
      this.projectsState.set("done");
    } catch (error) {
      this.projectsState.set("error");
      this.errorMessage.set(describeError(error));
    }
  }

  protected async onProjectChange(projectId: string): Promise<void> {
    this.selectedProjectId.set(projectId || null);
    this.selectedFolderId.set(null);
    this.folders.set([]);
    this.presets.set([]);
    this.asset.set(null);
    this.variant.set(null);
    if (!projectId) return;

    try {
      const [folderResponse, presetResponse] = await Promise.all([
        this.client.folders.list(projectId),
        this.client.presets.list(projectId),
      ]);
      this.folders.set(folderResponse.items);
      this.presets.set(
        presetResponse.items.filter((preset) => !preset.isSystem || true),
      );
    } catch (error) {
      this.errorMessage.set(describeError(error));
    }
  }

  protected onFolderChange(folderId: string): void {
    this.selectedFolderId.set(folderId || null);
  }

  protected onFileSelected(files: FileList | null): void {
    this.selectedFile.set(files?.[0] ?? null);
  }

  protected async upload(): Promise<void> {
    const projectId = this.selectedProjectId();
    const file = this.selectedFile();
    if (!projectId || !file) return;

    this.uploadState.set("busy");
    this.errorMessage.set(null);
    try {
      const result = await this.client.assets.upload({
        projectId,
        folderId: this.selectedFolderId(),
        file,
      });
      const details = await this.client.assets.get(result.asset.id);
      this.asset.set(details);
      this.uploadState.set("done");
      void this.pollAssetUntilReady(result.asset.id);
    } catch (error) {
      this.uploadState.set("error");
      this.errorMessage.set(describeError(error));
    }
  }

  protected async refreshAsset(): Promise<void> {
    const currentAsset = this.asset();
    if (!currentAsset) return;
    try {
      const details = await this.client.assets.get(currentAsset.id);
      this.asset.set(details);
    } catch (error) {
      this.errorMessage.set(describeError(error));
    }
  }

  private async pollAssetUntilReady(assetId: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      try {
        const details = await this.client.assets.get(assetId);
        this.asset.set(details);
        if (
          details.processingStatus === "ready" ||
          details.processingStatus === "failed"
        ) {
          return;
        }
      } catch (error) {
        this.errorMessage.set(describeError(error));
        return;
      }
    }
  }

  protected async generateVariant(): Promise<void> {
    const currentAsset = this.asset();
    const presetId = this.selectedPresetId();
    if (!currentAsset || !presetId) return;

    this.variantState.set("busy");
    this.errorMessage.set(null);
    try {
      const result = await this.client.variants.generate(currentAsset.id, {
        presetId,
      });
      this.variant.set(result.variant);
      this.jobStatus.set(result.status);
      this.variantState.set("done");
      if (result.processingJobId) {
        void this.pollJobUntilSettled(
          result.processingJobId,
          result.variant.id,
        );
      }
    } catch (error) {
      this.variantState.set("error");
      this.errorMessage.set(describeError(error));
    }
  }

  private async pollJobUntilSettled(
    jobId: string,
    variantId: string,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      try {
        const job: ProcessingJob = await this.client.processing.get(jobId);
        this.jobStatus.set(job.status);
        if (job.status === "completed" || job.status === "failed") {
          const currentAsset = this.asset();
          if (currentAsset) {
            const variants = await this.client.assets.variants(currentAsset.id);
            const items = variants.items as ImageVariant[];
            const updated = items.find((v) => v.id === variantId);
            if (updated) this.variant.set(updated);
          }
          return;
        }
      } catch (error) {
        this.errorMessage.set(describeError(error));
        return;
      }
    }
  }

  protected statusBadgeVariant(status: string): "secondary" | "outline" {
    return status === "ready" ? "secondary" : "outline";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof ImageryxApiError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unknown error";
}
