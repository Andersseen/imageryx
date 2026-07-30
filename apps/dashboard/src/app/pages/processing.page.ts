import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UpcomingPage } from './shared/upcoming-page.component';

@Component({
  selector: 'ix-processing-page',
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Processing"
      description="Inspect transformation jobs running on the Processing Worker's Queue consumer."
    />
  `,
})
export default class ProcessingPage {}
