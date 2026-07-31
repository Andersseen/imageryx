import { ChangeDetectionStrategy, Component } from "@angular/core";
import { PresetEditor } from "./preset-editor.component";

@Component({
  selector: "ix-preset-new-page",
  standalone: true,
  imports: [PresetEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ix-preset-editor [presetId]="null" />`,
})
export default class PresetNewPage {}
