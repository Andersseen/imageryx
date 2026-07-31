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
      description="Named transformation recipes (resize, crop, format, effects) reusable across every asset in a project."
      [upcoming]="planned"
    />
  `,
})
export default class PresetsPage {
  protected readonly planned = [
    "System and custom presets, grouped and listed per project",
    "A visual editor for resize, crop, output and effect operations",
    "Provider capability checks per preset (Cloudflare, Cloudinary, mock)",
    "Preset preview against a real asset, labelled when the transformation is simulated",
  ];
}
