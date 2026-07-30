import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { VoltBadge, VoltButton, VoltSeparator } from "@voltui/components";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { HealthService } from "../core/health/health.service";
import { ServiceStatusCard } from "./overview/service-status-card.component";

@Component({
  selector: "ix-overview-page",
  standalone: true,
  imports: [VoltBadge, VoltButton, VoltSeparator, ServiceStatusCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-8 py-8">
      <section class="flex flex-col gap-2">
        <h1 class="text-2xl font-semibold text-foreground">Imageryx</h1>
        <p class="max-w-2xl text-muted-foreground">
          Imageryx is an open, provider-independent image delivery and
          transformation platform: upload once, transform on request, and serve
          from the edge — without locking storage or transformation logic to a
          single vendor.
        </p>
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-foreground">
          Architecture, at a glance
        </h2>
        <dl class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Dashboard</dt>
            <dd class="text-sm text-muted-foreground">
              This app — project and asset management UI (Analog + Angular,
              zoneless).
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">API Worker</dt>
            <dd class="text-sm text-muted-foreground">
              Public entry point for auth, uploads, and transformation requests.
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Delivery Worker</dt>
            <dd class="text-sm text-muted-foreground">
              Serves transformed assets from the edge, cache-first.
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-card p-4">
            <dt class="font-medium text-foreground">Processing Worker</dt>
            <dd class="text-sm text-muted-foreground">
              Consumes a Queue to run transformation jobs off the request path.
            </dd>
          </div>
        </dl>
      </section>

      <volt-separator />

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-lg font-semibold text-foreground">
            Local service status
          </h2>
          <volt-button variant="outline" size="sm" (click)="refresh()"
            >Refresh</volt-button
          >
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

      <volt-separator />

      <section class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-card p-4">
          <h3 class="font-medium text-foreground">Environment</h3>
          <p class="mt-2 text-sm text-muted-foreground">
            Dashboard is running in
            <volt-badge variant="secondary">{{ env.appEnv }}</volt-badge>
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-4">
          <h3 class="font-medium text-foreground">Placeholder providers</h3>
          @if (apiInfoData(); as info) {
            <p
              class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
            >
              Storage
              <volt-badge variant="secondary">{{
                info.storageProvider
              }}</volt-badge>
              Transformation
              <volt-badge variant="secondary">{{
                info.transformationProvider
              }}</volt-badge>
            </p>
          } @else {
            <p class="mt-2 text-sm text-muted-foreground">
              Reported by the API Worker once it responds.
            </p>
          }
        </div>
      </section>

      <volt-separator />

      <section class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold text-foreground">Documentation</h2>
        <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>
            <span class="font-medium text-foreground">README.md</span> — stack,
            setup, commands, local URLs.
          </li>
          <li>
            <span class="font-medium text-foreground">ARCHITECTURE.md</span> —
            app responsibilities and planned data flow.
          </li>
          <li>
            <span class="font-medium text-foreground">ROADMAP.md</span> — what's
            next after Phase 1.
          </li>
        </ul>
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
