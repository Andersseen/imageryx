import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UpcomingPage } from './shared/upcoming-page.component';

@Component({
  selector: 'ix-settings-page',
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Settings"
      description="Account, team, and provider configuration for this Imageryx workspace."
    />
  `,
})
export default class SettingsPage {}
