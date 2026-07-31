import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { PresetEditor } from "./preset-editor.component";

@Component({
  selector: "ix-preset-detail-page",
  standalone: true,
  imports: [PresetEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ix-preset-editor [presetId]="presetId()" />`,
})
export default class PresetDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: null,
  });
  protected readonly presetId = computed(
    () => this.params()?.get("presetId") ?? null,
  );
}
