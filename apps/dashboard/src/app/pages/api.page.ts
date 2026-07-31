import { ChangeDetectionStrategy, Component } from "@angular/core";
import { UpcomingPage } from "./shared/upcoming-page.component";

@Component({
  selector: "ix-api-page",
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="API"
      description="An in-application developer reference for the Imageryx API, SDK and Angular component."
      [upcoming]="planned"
    />
  `,
})
export default class ApiPage {
  protected readonly planned = [
    "Live API, delivery, database and provider health",
    "Copyable TypeScript SDK, cURL, Angular and HTML examples using the selected project",
    "Upload, list, variant-generation and signed-download reference",
    "An honest statement of current limitations, including mock transformations",
  ];
}
