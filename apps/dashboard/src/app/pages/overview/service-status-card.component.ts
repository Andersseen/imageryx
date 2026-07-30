import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VoltBadge, type BadgeVariants } from '@voltui/components';
import type { ServiceHealthState } from '../../core/health/health.types';
import { describeServiceHealth } from '../../core/health/service-status';

const TONE_TO_BADGE_VARIANT: Record<ReturnType<typeof describeServiceHealth>['tone'], BadgeVariants['variant']> = {
  positive: 'solid',
  warning: 'outline',
  negative: 'destructive',
  neutral: 'secondary',
};

@Component({
  selector: 'ix-service-status-card',
  standalone: true,
  imports: [VoltBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-medium text-foreground">{{ title() }}</h3>
        <volt-badge [variant]="badgeVariant()">{{ description().label }}</volt-badge>
      </div>

      @switch (state().status) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">Checking {{ url() }}…</p>
        }
        @case ('success') {
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt class="text-muted-foreground">Version</dt>
            <dd class="text-foreground">{{ successData()?.version }}</dd>
            <dt class="text-muted-foreground">Environment</dt>
            <dd class="text-foreground">{{ successData()?.environment }}</dd>
            <dt class="text-muted-foreground">Checked</dt>
            <dd class="text-foreground">{{ checkedAt() }}</dd>
          </dl>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ errorMessage() }} — is it running on {{ url() }}?</p>
        }
      }
    </div>
  `,
})
export class ServiceStatusCard {
  readonly title = input.required<string>();
  readonly url = input.required<string>();
  readonly state = input.required<ServiceHealthState>();

  protected readonly description = computed(() => describeServiceHealth(this.state()));
  protected readonly badgeVariant = computed(() => TONE_TO_BADGE_VARIANT[this.description().tone]);

  protected readonly successData = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  protected readonly errorMessage = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.message : '';
  });

  protected readonly checkedAt = computed(() => {
    const data = this.successData();
    return data ? new Date(data.timestamp).toLocaleTimeString() : '';
  });
}
