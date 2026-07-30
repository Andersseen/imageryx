import { ChangeDetectionStrategy, Component } from "@angular/core";
import { UpcomingPage } from "./shared/upcoming-page.component";

@Component({
  selector: "ix-presets-page",
  standalone: true,
  imports: [UpcomingPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ix-upcoming-page
      title="Presets"
      description="Save named transformation recipes (resize, format, crop) for reuse across requests."
    />
  `,
})
export default class PresetsPage {}
