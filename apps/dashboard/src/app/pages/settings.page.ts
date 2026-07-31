import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { VoltBadge, VoltButton } from "@voltui/components";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { HealthService } from "../core/health/health.service";
import { PageHeader } from "../ui/page-header.component";

/** Accurate as of this phase — `image-core`'s MIME sniff (`packages/image-core/src/security/mime-validation.ts`) recognizes exactly these five, plus SVG under its own warning. */
const SUPPORTED_RASTER_FORMATS = [
  "JPEG",
  "PNG",
  "GIF",
  "WebP",
  "AVIF",
] as const;

/**
 * `/settings` — every value here comes from the same `GET /v1/info` the `/api` page reads (via
 * the shared `HealthService`) plus the dashboard's own build-time env. There is no settings
 * mutation endpoint anywhere in this API, so nothing on this page is a form: it is a read-only
 * report of how this installation is actually configured, not a place to change it.
 */
@Component({
  selector: "ix-settings-page",
  standalone: true,
  imports: [RouterLink, VoltBadge, VoltButton, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="Settings"
        description="How this installation is configured. Every value is read-only — there is no settings-mutation endpoint in this API yet."
      >
        <volt-button
          variant="outline"
          size="sm"
          (click)="refresh()"
          data-testid="settings-refresh"
        >
          Refresh
        </volt-button>
      </ix-page-header>

      @if (infoState(); as state) {
        @if (state.status === "loading") {
          <p class="text-sm text-muted-foreground">
            Loading configuration from the API Worker…
          </p>
        } @else if (state.status === "error") {
          <p class="text-sm text-destructive" role="alert">
            Could not load configuration: {{ state.message }}
          </p>
        } @else {
          <div class="grid gap-4 sm:grid-cols-2">
            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-general"
            >
              <h2 class="text-sm font-semibold">General</h2>
              <dl class="flex flex-col gap-1 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Environment</dt>
                  <dd>
                    <volt-badge variant="secondary">{{
                      state.data.environment
                    }}</volt-badge>
                  </dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">API Worker version</dt>
                  <dd class="font-mono">{{ state.data.version }}</dd>
                </div>
              </dl>
            </section>

            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-storage"
            >
              <h2 class="text-sm font-semibold">Storage</h2>
              <p class="text-sm">
                Provider:
                <volt-badge variant="secondary">{{
                  state.data.storageProvider
                }}</volt-badge>
              </p>
            </section>

            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-transformations"
            >
              <h2 class="text-sm font-semibold">Transformations</h2>
              <p class="text-sm">
                Provider:
                <volt-badge variant="secondary">{{
                  state.data.transformationProvider
                }}</volt-badge>
              </p>
              @if (state.data.transformationProvider === "mock") {
                <p class="text-xs text-muted-foreground">
                  Variants are real files with correct dimensions and format,
                  but pixel data is not actually resampled from the original in
                  this environment.
                </p>
              }
            </section>

            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-upload-policy"
            >
              <h2 class="text-sm font-semibold">Upload policy</h2>
              <dl class="flex flex-col gap-1 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Max upload size</dt>
                  <dd>{{ state.data.uploadPolicy.maxUploadSizeMb }} MB</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">
                    Deleted-asset recovery window
                  </dt>
                  <dd>{{ state.data.uploadPolicy.assetRecoveryDays }} days</dd>
                </div>
              </dl>
              <p class="text-xs text-muted-foreground">
                Supported: {{ supportedFormats }}, and SVG (flagged as untrusted
                content rather than fully sanitized).
              </p>
            </section>

            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-processing"
            >
              <h2 class="text-sm font-semibold">Processing</h2>
              <dl class="flex flex-col gap-1 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Mode</dt>
                  <dd>
                    <volt-badge variant="secondary">{{
                      state.data.processing.mode
                    }}</volt-badge>
                  </dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Max attempts</dt>
                  <dd>{{ state.data.processing.maxAttempts }}</dd>
                </div>
              </dl>
            </section>

            <section
              class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              data-testid="settings-domains"
            >
              <h2 class="text-sm font-semibold">Domains</h2>
              <dl class="flex flex-col gap-1 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Dashboard</dt>
                  <dd class="font-mono text-xs">{{ dashboardOrigin() }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">API</dt>
                  <dd class="font-mono text-xs">{{ env.apiUrl }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Delivery</dt>
                  <dd class="font-mono text-xs">
                    {{ state.data.deliveryUrl }}
                  </dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">Processing</dt>
                  <dd class="font-mono text-xs">{{ env.processingUrl }}</dd>
                </div>
              </dl>
            </section>
          </div>
        }
      }

      <section
        class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
        data-testid="settings-about"
      >
        <h2 class="text-sm font-semibold">About</h2>
        <p class="text-sm text-muted-foreground">
          Imageryx dashboard — MIT licensed. See the
          <a
            routerLink="/api"
            class="text-primary underline-offset-2 hover:underline"
            >API reference</a
          >
          for live endpoint and provider details.
        </p>
      </section>
    </div>
  `,
})
export default class SettingsPage {
  protected readonly env = inject(DASHBOARD_ENV);
  protected readonly health = inject(HealthService);

  protected readonly infoState = computed(() => this.health.apiInfo());
  protected readonly supportedFormats = SUPPORTED_RASTER_FORMATS.join(", ");

  protected dashboardOrigin(): string {
    return typeof window !== "undefined" ? window.location.origin : "—";
  }

  protected refresh(): void {
    this.health.refresh();
  }
}
