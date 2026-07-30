import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UpcomingPage } from './shared/upcoming-page.component';

@Component({
  selector: 'ix-projects-page',
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Projects"
      description="Group assets, presets, and API keys under a project, with per-project usage."
    />
  `,
})
export default class ProjectsPage {}
