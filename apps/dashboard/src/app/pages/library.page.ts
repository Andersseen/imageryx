import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UpcomingPage } from './shared/upcoming-page.component';

@Component({
  selector: 'ix-library-page',
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Library"
      description="Browse, search, and manage every asset uploaded to Imageryx."
    />
  `,
})
export default class LibraryPage {}
