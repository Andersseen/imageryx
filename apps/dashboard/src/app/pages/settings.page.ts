import { ChangeDetectionStrategy, Component } from "@angular/core";
import { UpcomingPage } from "./shared/upcoming-page.component";

@Component({
  selector: "ix-settings-page",
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Settings"
      description="Environment, storage, transformation and upload configuration for this Imageryx installation."
      [upcoming]="planned"
    />
  `,
})
export default class SettingsPage {
  protected readonly planned = [
    "Active storage and transformation providers, with real configuration state",
    "Upload policy: size limit, supported formats, recovery window, SVG handling",
    "Processing mode, attempt limit and queue status",
    "Dashboard, API and delivery domains, plus version and licence information",
  ];
}
