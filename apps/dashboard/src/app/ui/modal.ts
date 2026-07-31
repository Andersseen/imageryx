import { inject, type TemplateRef, ViewContainerRef } from "@angular/core";
import { DialogService, type DialogRef } from "quartz-headless";

/**
 * Shared open/close plumbing for the dashboard's dialogs.
 *
 * Two things it exists to guarantee, both of which are easy to forget per dialog and invisible
 * when missed:
 *
 * - **Focus is restored** to whatever was focused before the dialog opened. Without this, a
 *   keyboard or screen-reader user is dropped at the top of the document every time they cancel.
 * - **Only one instance opens** per controller, so a double-click cannot stack two copies of the
 *   same dialog with the second trapping focus behind the first.
 *
 * Quartz's `DialogService` supplies the rest of the behaviour (backdrop, Escape, containment);
 * the visual shell lives in each dialog's own template so Volt still owns how it looks.
 */
export class ModalController {
  private readonly dialogs = inject(DialogService);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private dialogRef: DialogRef | null = null;
  private previouslyFocused: HTMLElement | null = null;

  get isOpen(): boolean {
    return this.dialogRef !== null;
  }

  open(
    template: TemplateRef<unknown>,
    options: { closeOnBackdropClick?: boolean } = {},
  ): void {
    if (this.dialogRef) return;

    this.previouslyFocused =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    this.dialogRef = this.dialogs.open(template, this.viewContainerRef, {
      closeOnBackdropClick: options.closeOnBackdropClick ?? true,
      closeOnEscape: true,
    });

    this.dialogRef.closed$.subscribe(() => {
      this.dialogRef = null;
      this.previouslyFocused?.focus();
      this.previouslyFocused = null;
    });
  }

  close(): void {
    this.dialogRef?.close();
  }
}
