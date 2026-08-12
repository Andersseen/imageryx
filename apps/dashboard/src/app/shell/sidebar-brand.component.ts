import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { VoltSidebarService } from "@voltui/components";
import { BrandMark } from "../ui/brand-mark.component";

/**
 * Sidebar header: the monogram, plus the wordmark when there is room for it.
 *
 * Owns the collapsed check itself rather than taking it as an input — `VoltSidebarService` is
 * the single source of truth for that state, and threading it down through `ix-app-shell`
 * would just be a second copy that can disagree.
 */
@Component({
  selector: "ix-sidebar-brand",
  standalone: true,
  imports: [RouterLink, BrandMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/"
      class="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
    >
      <ix-brand-mark size="sm" />
      @if (!sidebar.isCollapsed()) {
        <span>Imageryx</span>
      }
    </a>
  `,
})
export class SidebarBrand {
  protected readonly sidebar = inject(VoltSidebarService);
}
