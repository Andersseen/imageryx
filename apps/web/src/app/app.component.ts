import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { buttonVariants } from "@voltui/components";
import { LmnGithubIcon } from "lumen-icons";

const GITHUB_URL = "https://github.com/Andersseen/imageryx";

@Component({
  selector: "ix-root",
  standalone: true,
  imports: [RouterLink, RouterOutlet, LmnGithubIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur"
      >
        <div
          class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
        >
          <a
            routerLink="/"
            class="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground"
            >
              Ix
            </span>
            <span>Imageryx</span>
          </a>

          <nav class="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#features" class="transition-colors hover:text-foreground"
              >Features</a
            >
            <a
              href="#architecture"
              class="transition-colors hover:text-foreground"
              >Architecture</a
            >
            <a href="#stack" class="transition-colors hover:text-foreground"
              >Stack</a
            >
          </nav>

          <a
            [href]="githubUrl"
            target="_blank"
            rel="noreferrer"
            [class]="headerLinkClass"
          >
            <lmn-github [size]="16" />
            GitHub
          </a>
        </div>
      </header>

      <main class="flex-1">
        <router-outlet />
      </main>

      <footer class="border-t border-border/60">
        <div
          class="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p>&copy; {{ year }} Imageryx. Open source under the MIT license.</p>
          <a
            [href]="githubUrl"
            target="_blank"
            rel="noreferrer"
            class="transition-colors hover:text-foreground"
            >github.com/Andersseen/imageryx</a
          >
        </div>
      </footer>
    </div>
  `,
})
export class AppComponent {
  protected readonly githubUrl = GITHUB_URL;
  protected readonly year = new Date().getFullYear();
  protected readonly headerLinkClass = buttonVariants({
    variant: "outline",
    size: "sm",
  });
}
