import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { ImagePreset } from "@imageryx/sdk";
import {
  VoltBadge,
  VoltButton,
  VoltTabs,
  VoltTabsContent,
  VoltTabsList,
  VoltTabsTrigger,
} from "@voltui/components";
import { AsyncStore } from "../core/api/async-store";
import {
  buildCurlUploadSnippet,
  buildSdkSnippet,
} from "../core/delivery/snippets-extra";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { HealthService } from "../core/health/health.service";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { CopyButton } from "../ui/copy-button.component";
import { PageHeader } from "../ui/page-header.component";
import { ServiceStatusCard } from "./overview/service-status-card.component";

/** A placeholder asset path — every project has its own real assets, but none is universal enough to hardcode, so the examples say so. */
const EXAMPLE_ASSET_PATH = "photos/hero.jpg";
type SnippetTab = "curl" | "sdk" | "angular" | "html";

interface ApiKeySummary {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface CreatedApiKey extends ApiKeySummary {
  key: string;
}

/**
 * `/api` — an in-application developer reference: the same live health/info the overview page
 * shows, the masked API key (never the full one — see `apiInfoData().apiKeyPrefix`), copyable
 * examples generated from the real SDK against whichever project is selected, and an honest
 * limitations list grounded in what this phase actually shipped (see context.md).
 */
@Component({
  selector: "ix-api-page",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    VoltTabs,
    VoltTabsContent,
    VoltTabsList,
    VoltTabsTrigger,
    CopyButton,
    PageHeader,
    ServiceStatusCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="API"
        description="A developer reference for the Imageryx API, SDK and Angular component — every value below is live, not documentation copy."
      >
        <volt-button
          variant="outline"
          size="sm"
          (click)="refreshHealth()"
          data-testid="api-refresh"
        >
          Refresh
        </volt-button>
      </ix-page-header>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Service health</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <ix-service-status-card
            title="API Worker"
            [url]="env.apiUrl"
            [state]="health.apiWorker()"
          />
          <ix-service-status-card
            title="Delivery Worker"
            [url]="env.deliveryUrl"
            [state]="health.deliveryWorker()"
          />
          <ix-service-status-card
            title="Processing Worker"
            [url]="env.processingUrl"
            [state]="health.processingWorker()"
          />
        </div>
      </section>

      @if (infoState(); as state) {
        @if (state.status === "success") {
          <section
            class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
            data-testid="api-info"
          >
            <div>
              <dt class="text-xs font-medium text-muted-foreground">Version</dt>
              <dd class="text-sm">
                {{ state.data.version }} ({{ state.data.environment }})
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Delivery base URL
              </dt>
              <dd class="font-mono text-sm">{{ state.data.deliveryUrl }}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Storage / transformation providers
              </dt>
              <dd class="flex flex-wrap gap-2 text-sm">
                <volt-badge variant="secondary">{{
                  state.data.storageProvider
                }}</volt-badge>
                <volt-badge variant="secondary">{{
                  state.data.transformationProvider
                }}</volt-badge>
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Upload policy
              </dt>
              <dd class="text-sm">
                {{ state.data.uploadPolicy.maxUploadSizeMb }} MB max,
                {{ state.data.uploadPolicy.assetRecoveryDays }}-day recovery
                window after delete
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Processing
              </dt>
              <dd class="text-sm">
                {{ state.data.processing.mode }} mode,
                {{ state.data.processing.maxAttempts }} max attempts
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">API key</dt>
              <dd class="flex items-center gap-2">
                <span class="font-mono text-sm" data-testid="api-key-prefix">{{
                  state.data.apiKeyPrefix
                }}</span>
                <span class="text-xs text-muted-foreground"
                  >(prefix only — the full key is never sent to the
                  browser)</span
                >
              </dd>
            </div>
          </section>
        } @else if (state.status === "error") {
          <p class="text-sm text-destructive" role="alert">
            Could not load API info: {{ state.message }}
          </p>
        }
      }

      <section
        class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">API keys</h2>
            <p class="text-xs text-muted-foreground">
              Full keys are shown once. Store them before leaving this page.
            </p>
          </div>
          <form
            class="flex min-w-0 flex-1 justify-end gap-2 sm:flex-none"
            (submit)="createApiKey($event, keyName.value)"
          >
            <input
              #keyName
              type="text"
              name="name"
              maxlength="80"
              placeholder="Key name"
              class="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            />
            <volt-button type="submit" size="sm">Create</volt-button>
          </form>
        </div>

        @if (createdApiKey(); as created) {
          <div
            class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
            data-testid="created-api-key"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted-foreground"
                >New key</span
              >
              <ix-copy-button
                [value]="created.key"
                label="new API key"
                idleLabel="Copy"
              />
            </div>
            <code class="break-all text-xs">{{ created.key }}</code>
          </div>
        }

        @if (apiKeysState().status === "loading") {
          <p class="text-sm text-muted-foreground">Loading keys...</p>
        } @else if (apiKeysState().status === "error") {
          <p class="text-sm text-destructive" role="alert">
            {{ apiKeysErrorMessage() }}
          </p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead class="text-xs text-muted-foreground">
                <tr class="border-b border-border">
                  <th class="py-2 pr-3 font-medium">Name</th>
                  <th class="py-2 pr-3 font-medium">Prefix</th>
                  <th class="py-2 pr-3 font-medium">Created</th>
                  <th class="py-2 pr-3 font-medium">Last used</th>
                  <th class="py-2 pr-3 font-medium">Status</th>
                  <th class="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (key of apiKeysState().items; track key.id) {
                  <tr class="border-b border-border last:border-0">
                    <td class="py-2 pr-3">{{ key.name ?? "Untitled key" }}</td>
                    <td class="py-2 pr-3 font-mono text-xs">
                      {{ key.prefix }}
                    </td>
                    <td class="py-2 pr-3">{{ formatDate(key.createdAt) }}</td>
                    <td class="py-2 pr-3">
                      {{
                        key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"
                      }}
                    </td>
                    <td class="py-2 pr-3">
                      <volt-badge
                        [variant]="key.revokedAt ? 'secondary' : 'solid'"
                      >
                        {{ key.revokedAt ? "Revoked" : "Active" }}
                      </volt-badge>
                    </td>
                    <td class="py-2 text-right">
                      <volt-button
                        variant="outline"
                        size="sm"
                        [disabled]="!!key.revokedAt"
                        (click)="revokeApiKey(key.id)"
                      >
                        Revoke
                      </volt-button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td
                      colspan="6"
                      class="py-6 text-center text-sm text-muted-foreground"
                    >
                      No database-backed API keys yet.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section
        class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h2 class="text-sm font-semibold">Code examples</h2>
        @if (!context.selectedProjectId()) {
          <p class="text-sm text-muted-foreground">
            Select a project to generate live examples for it.
          </p>
        } @else {
          <p class="text-xs text-muted-foreground">
            Using project <strong>{{ context.selectedProject()?.slug }}</strong
            >{{ examplePresetSlug() ? " and preset " : ""
            }}<strong>{{ examplePresetSlug() }}</strong
            >. Replace <code>{{ examplePath }}</code> with a real asset path
            from your Library.
          </p>

          <volt-tabs
            [value]="activeSnippetTab()"
            (valueChange)="onSnippetTabChange($event)"
          >
            <volt-tabs-list aria-label="Code example language">
              <volt-tabs-trigger value="curl">cURL</volt-tabs-trigger>
              <volt-tabs-trigger value="sdk">SDK</volt-tabs-trigger>
              <volt-tabs-trigger value="angular">Angular</volt-tabs-trigger>
              <volt-tabs-trigger value="html">HTML</volt-tabs-trigger>
            </volt-tabs-list>

            <volt-tabs-content value="curl">
              <div class="flex items-start justify-between gap-2">
                <pre
                  class="flex-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
                  data-testid="example-curl"
                  >{{ curlSnippet() }}</pre
                >
                <ix-copy-button
                  [value]="curlSnippet()"
                  label="cURL upload example"
                  idleLabel="Copy"
                />
              </div>
            </volt-tabs-content>
            <volt-tabs-content value="sdk">
              <div class="flex items-start justify-between gap-2">
                <pre
                  class="flex-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
                  data-testid="example-sdk"
                  >{{ sdkSnippet() }}</pre
                >
                <ix-copy-button
                  [value]="sdkSnippet()"
                  label="SDK example"
                  idleLabel="Copy"
                />
              </div>
            </volt-tabs-content>
            <volt-tabs-content value="angular">
              <div class="flex items-start justify-between gap-2">
                <pre
                  class="flex-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
                  data-testid="example-angular"
                  >{{ angularSnippet() }}</pre
                >
                <ix-copy-button
                  [value]="angularSnippet()"
                  label="Angular example"
                  idleLabel="Copy"
                />
              </div>
            </volt-tabs-content>
            <volt-tabs-content value="html">
              <div class="flex items-start justify-between gap-2">
                <pre
                  class="flex-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
                  data-testid="example-html"
                  >{{ htmlSnippet() }}</pre
                >
                <ix-copy-button
                  [value]="htmlSnippet()"
                  label="HTML example"
                  idleLabel="Copy"
                />
              </div>
            </volt-tabs-content>
          </volt-tabs>
        }
      </section>

      <section
        class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      >
        <h2 class="text-sm font-semibold">Limitations</h2>
        <ul class="flex flex-col gap-2 text-sm text-muted-foreground">
          @if (isMockProvider()) {
            <li>
              Transformations run through
              <code>MockTransformationProvider</code> in this environment —
              generated variants are real files with correct dimensions and
              format, but pixel data is not actually resampled from the
              original.
            </li>
          }
          <li>
            There is no shared OpenAPI schema or generated client yet — the
            SDK's response types are hand-written to match each route.
          </li>
          <li>
            <code>extract-placeholder</code>, <code>strip-metadata</code>,
            <code>copy-provider-result</code>, <code>delete-object</code> and
            <code>batch-operation</code> processing-job types have no handler
            yet and fail immediately if dispatched; only
            <code>inspect-metadata</code> and <code>generate-variant</code> run
            for real.
          </li>
          <li>
            There is no rate limiting on the API today — nothing in this
            reference implies a request budget.
          </li>
          <li>
            Browser code never holds an API key: this dashboard's own examples
            go through a same-origin dev proxy that injects one server-side,
            which is confirmed to work locally but not verified in this
            dashboard's current static-SPA production deployment.
          </li>
        </ul>
      </section>
    </div>
  `,
})
export default class ApiPage {
  protected readonly env = inject(DASHBOARD_ENV);
  protected readonly health = inject(HealthService);
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly examplePath = EXAMPLE_ASSET_PATH;
  protected readonly activeSnippetTab = signal<SnippetTab>("curl");
  protected readonly apiKeysState = signal<
    | { status: "loading"; items: ApiKeySummary[] }
    | { status: "success"; items: ApiKeySummary[] }
    | { status: "error"; items: ApiKeySummary[]; message: string }
  >({ status: "loading", items: [] });
  protected readonly createdApiKey = signal<CreatedApiKey | null>(null);
  protected readonly apiKeysErrorMessage = computed(() => {
    const state = this.apiKeysState();
    return state.status === "error" ? state.message : "";
  });

  protected readonly infoState = computed(() => this.health.apiInfo());
  protected readonly isMockProvider = computed(() => {
    const state = this.health.apiInfo();
    return (
      state.status === "success" && state.data.transformationProvider === "mock"
    );
  });

  private readonly presets = new AsyncStore<ImagePreset[]>();
  private lastPresetProjectId: string | null = null;

  protected readonly examplePresetSlug = computed(
    () => this.presets.data()?.[0]?.slug ?? null,
  );

  protected readonly curlSnippet = computed(() => {
    const projectId = this.context.selectedProjectId();
    if (!projectId) return "";
    return buildCurlUploadSnippet({ apiUrl: this.env.apiUrl, projectId });
  });

  protected readonly sdkSnippet = computed(() => {
    const slug = this.context.selectedProject()?.slug;
    if (!slug) return "";
    return buildSdkSnippet({
      project: slug,
      asset: this.examplePath,
      preset: this.examplePresetSlug() ?? undefined,
    });
  });

  protected readonly angularSnippet = computed(() => {
    const slug = this.context.selectedProject()?.slug;
    if (!slug) return "";
    return this.client.snippets.angular({
      project: slug,
      asset: this.examplePath,
      preset: this.examplePresetSlug() ?? undefined,
      alt: "Example asset",
    });
  });

  protected readonly htmlSnippet = computed(() => {
    const slug = this.context.selectedProject()?.slug;
    if (!slug) return "";
    return this.client.snippets.html({
      project: slug,
      asset: this.examplePath,
      preset: this.examplePresetSlug() ?? undefined,
      alt: "Example asset",
    });
  });

  constructor() {
    void this.context.ensureLoaded();
    void this.loadApiKeys();

    effect(() => {
      const projectId = this.context.selectedProjectId();
      if (!projectId || projectId === this.lastPresetProjectId) return;
      this.lastPresetProjectId = projectId;
      untracked(() => void this.loadPresets(projectId));
    });
  }

  private async loadPresets(projectId: string): Promise<void> {
    await this.presets.load(
      async () => (await this.client.presets.list(projectId)).items,
    );
  }

  protected refreshHealth(): void {
    this.health.refresh();
    void this.loadApiKeys();
  }

  protected onSnippetTabChange(value: string | undefined): void {
    if (
      value === "curl" ||
      value === "sdk" ||
      value === "angular" ||
      value === "html"
    ) {
      this.activeSnippetTab.set(value);
    }
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  protected async createApiKey(
    event: SubmitEvent,
    name: string,
  ): Promise<void> {
    event.preventDefault();
    const response = await fetch("/proxy/v1/api-keys", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || undefined }),
    });
    if (!response.ok) {
      this.apiKeysState.set({
        status: "error",
        items: this.apiKeysState().items,
        message: "Could not create API key.",
      });
      return;
    }

    const created = (await response.json()) as CreatedApiKey;
    this.createdApiKey.set(created);
    await this.loadApiKeys();
  }

  protected async revokeApiKey(id: string): Promise<void> {
    const response = await fetch(
      `/proxy/v1/api-keys/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      this.apiKeysState.set({
        status: "error",
        items: this.apiKeysState().items,
        message: "Could not revoke API key.",
      });
      return;
    }
    await this.loadApiKeys();
  }

  private async loadApiKeys(): Promise<void> {
    const previous = this.apiKeysState().items;
    this.apiKeysState.set({ status: "loading", items: previous });
    try {
      const response = await fetch("/proxy/v1/api-keys", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("API key list request failed.");
      const body = (await response.json()) as { items: ApiKeySummary[] };
      this.apiKeysState.set({ status: "success", items: body.items });
    } catch {
      this.apiKeysState.set({
        status: "error",
        items: previous,
        message: "Could not load API keys.",
      });
    }
  }
}
