import { ChangeDetectionStrategy, Component } from "@angular/core";
import { UpcomingPage } from "./shared/upcoming-page.component";

@Component({
  selector: "ix-processing-page",
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Processing"
      description="Transformation jobs running on the Processing Worker's Queue consumer."
      [upcoming]="planned"
    />
  `,
})
export default class ProcessingPage {
  protected readonly planned = [
    "Job list filtered by project, asset, type, status and provider",
    "Scoped polling that stops once every visible job reaches a terminal state",
    "Retry for retryable failures and cancel for queued jobs",
    "Per-job detail with a safe input, result and error summary",
  ];
}
