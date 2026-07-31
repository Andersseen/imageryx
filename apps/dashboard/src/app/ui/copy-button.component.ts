import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from "@angular/core";
import { VoltButton } from "@voltui/components";
import { LmnCheckIcon, LmnDocumentDuplicateIcon } from "lumen-icons";

const FEEDBACK_DURATION_MS = 1600;

/**
 * Copy-to-clipboard with visible, announced confirmation.
 *
 * The confirmation is the point: a copy action with no feedback is indistinguishable from a
 * broken one. The label swaps to "Copied" (visible text, not just a colour change) and the
 * live region announces it, so the result is available whether you can see the button or not.
 *
 * `navigator.clipboard` is unavailable on insecure origins and in some embedded webviews, so a
 * failure is reported honestly rather than silently pretending to have succeeded.
 */
@Component({
  selector: "ix-copy-button",
  standalone: true,
  imports: [VoltButton, LmnCheckIcon, LmnDocumentDuplicateIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <volt-button
      [variant]="variant()"
      [size]="size()"
      [disabled]="!value()"
      (click)="copy()"
      data-testid="copy-button"
    >
      @if (state() === "copied") {
        <lmn-check slot="leading" [size]="14" />
      } @else {
        <lmn-document-duplicate slot="leading" [size]="14" />
      }
      <span>{{ buttonLabel() }}</span>
      <span class="sr-only">{{ label() }}</span>
    </volt-button>
    <span class="sr-only" role="status" aria-live="polite">{{
      announcement()
    }}</span>
  `,
})
export class CopyButton {
  /** The exact string placed on the clipboard. */
  readonly value = input.required<string>();
  /** Accessible description of *what* is being copied, e.g. "public delivery URL". */
  readonly label = input<string>("value");
  readonly idleLabel = input<string>("Copy");
  readonly variant = input<"solid" | "outline" | "ghost">("outline");
  readonly size = input<"sm" | "md">("sm");

  private readonly destroyRef = inject(DestroyRef);
  protected readonly state = signal<"idle" | "copied" | "failed">("idle");
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.resetTimer !== null) clearTimeout(this.resetTimer);
    });
  }

  protected buttonLabel(): string {
    if (this.state() === "copied") return "Copied";
    if (this.state() === "failed") return "Copy failed";
    return this.idleLabel();
  }

  protected announcement(): string {
    if (this.state() === "copied")
      return `Copied ${this.label()} to the clipboard.`;
    if (this.state() === "failed")
      return `Could not copy the ${this.label()}. Copy it manually.`;
    return "";
  }

  protected async copy(): Promise<void> {
    const value = this.value();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      this.state.set("copied");
    } catch {
      this.state.set("failed");
    }

    if (this.resetTimer !== null) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(
      () => this.state.set("idle"),
      FEEDBACK_DURATION_MS,
    );
  }
}
