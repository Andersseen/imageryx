import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { VoltButton } from "@voltui/components";
import { AuthSessionService } from "../core/auth/auth-session.service";
import { BrandMark } from "../ui/brand-mark.component";

/**
 * The whole of Imageryx's sign-in surface: one hand-off to DevAuth.
 *
 * There is no credential form here and there never should be — account creation, password
 * reset and GitHub linking all belong to DevAuth, and a password field rendered on this origin
 * would put the credential inside reach of every script this app loads. See README's
 * "User sign-in (DevAuth, OAuth 2.1 / OIDC)".
 *
 * The button is wrapped in a `flex flex-col` container rather than given a width class
 * directly: `volt-button`'s `class` input styles its *inner* `<button>`, and the custom element
 * host is `display: inline` by default, so `w-full` alone would resolve against an inline box.
 * As a column flex item the host stretches, and the inner button then fills it.
 */
@Component({
  selector: "ix-sign-in-panel",
  standalone: true,
  imports: [VoltButton, BrandMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="flex h-dvh items-center justify-center bg-background p-6 text-foreground"
    >
      <section class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-3">
          <ix-brand-mark size="md" />
          <div>
            <h1 class="text-lg font-semibold tracking-tight">Imageryx</h1>
            <p class="text-sm text-muted-foreground">Personal dashboard</p>
          </div>
        </div>
        <div class="flex flex-col">
          <volt-button class="w-full" (click)="signIn()">
            Continue with DevAuth
          </volt-button>
        </div>
      </section>
    </main>
  `,
})
export class SignInPanel {
  private readonly auth = inject(AuthSessionService);

  protected signIn(): void {
    this.auth.startLogin("/");
  }
}
