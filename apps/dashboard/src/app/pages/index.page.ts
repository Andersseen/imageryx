import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { VoltBadge, VoltButton } from "@voltui/components";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { HealthService } from "../core/health/health.service";
import { PageHeader } from "../ui/page-header.component";
import { ServiceStatusCard } from "./overview/service-status-card.component";

/**
 * The signed-in landing page: what the system is, whether its services are up, and where to read
 * more.
 *
 * Uses `ix-page-header` like every other route rather than its own `<h1>`, which is what keeps the
 * "exactly one `<h1>` per route" guarantee that component exists for.
 *
 * Sections are separated by spacing alone. This page used to put a `<volt-separator />` between
 * every one of them, which drew four full-width rules through a page whose sections were already
 * delimited by their own headings and card groups — the rules encoded nothing the layout wasn't
 * already saying.
 */
@Component({
  selector: "ix-overview-page",
  standalone: true,
  imports: [VoltBadge, VoltButton, PageHeader, ServiceStatusCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-8">
      <ix-page-header
        title="Imageryx"
        description="An open, provider-independent image delivery and transformation platform: upload once, transform on request, and serve from the edge — without locking storage or transformation logic to a single vendor."
      />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">
          Architecture, at a glance
        </h2>
        <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Dashboard</dt>
            <dd class="mt-1 text-sm text-muted-foreground">
              This app — project and asset management UI (Analog + Angular,
              zoneless).
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">API Worker</dt>
            <dd class="mt-1 text-sm text-muted-foreground">
              Public entry point for auth, uploads, and transformation requests.
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Delivery Worker</dt>
            <dd class="mt-1 text-sm text-muted-foreground">
              Serves transformed assets from the edge, cache-first.
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Processing Worker</dt>
            <dd class="mt-1 text-sm text-muted-foreground">
              Consumes a Queue to run transformation jobs off the request path.
            </dd>
          </div>
        </dl>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-lg font-semibold text-foreground">
            Local service status
          </h2>
          <volt-button variant="outline" size="sm" (click)="refresh()">
            Refresh
          </volt-button>
        </div>
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

      <!--
        Environment and the two provider names were three near-empty cards holding one fact each.
        They are all "what is this dashboard talking to right now", so they read better as one
        labelled set than as three slabs.
      -->
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">Runtime</h2>
        <div class="rounded-lg border border-border bg-card p-4">
          <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div class="flex flex-col items-start gap-1.5">
              <dt class="text-sm text-muted-foreground">Environment</dt>
              <dd>
                <volt-badge variant="secondary">{{ env.appEnv }}</volt-badge>
              </dd>
            </div>
            @if (apiInfoData(); as info) {
              <div class="flex flex-col items-start gap-1.5">
                <dt class="text-sm text-muted-foreground">Storage</dt>
                <dd>
                  <volt-badge variant="secondary">{{
                    info.storageProvider
                  }}</volt-badge>
                </dd>
              </div>
              <div class="flex flex-col items-start gap-1.5">
                <dt class="text-sm text-muted-foreground">Transformation</dt>
                <dd>
                  <volt-badge variant="secondary">{{
                    info.transformationProvider
                  }}</volt-badge>
                </dd>
              </div>
            } @else {
              <div class="flex flex-col items-start gap-1.5 sm:col-span-2">
                <dt class="text-sm text-muted-foreground">Providers</dt>
                <dd class="text-sm text-muted-foreground">
                  Reported by the API Worker once it responds.
                </dd>
              </div>
            }
          </dl>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">Documentation</h2>
        <dl class="flex flex-col gap-2 text-sm">
          <div class="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt class="font-medium text-foreground">README.md</dt>
            <dd class="text-muted-foreground">
              Stack, setup, commands, local URLs.
            </dd>
          </div>
          <div class="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt class="font-medium text-foreground">ARCHITECTURE.md</dt>
            <dd class="text-muted-foreground">
              App responsibilities and planned data flow.
            </dd>
          </div>
          <div class="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt class="font-medium text-foreground">ROADMAP.md</dt>
            <dd class="text-muted-foreground">What's next after Phase 1.</dd>
          </div>
        </dl>
      </section>
    </div>
  `,
})
export default class OverviewPage {
  protected readonly env = inject(DASHBOARD_ENV);
  protected readonly health = inject(HealthService);

  protected readonly apiInfoData = computed(() => {
    const info = this.health.apiInfo();
    return info.status === "success" ? info.data : null;
  });

  protected refresh(): void {
    this.health.refresh();
  }
}
