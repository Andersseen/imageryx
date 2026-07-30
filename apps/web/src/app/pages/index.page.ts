import { ChangeDetectionStrategy, Component } from "@angular/core";
import {
  VoltBadge,
  VoltCard,
  VoltCardContent,
  VoltCardDescription,
  VoltCardHeader,
  VoltCardTitle,
  VoltSeparator,
  buttonVariants,
} from "@voltui/components";
import { MoveEnterDirective } from "angular-movement";
import {
  LmnCloudArrowUpIcon,
  LmnCodeBracketIcon,
  LmnGithubIcon,
  LmnGlobeAltIcon,
  LmnLockOpenIcon,
  LmnServerStackIcon,
  LmnShieldCheckIcon,
} from "lumen-icons";

const GITHUB_URL = "https://github.com/Andersseen/imageryx";

interface Feature {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

interface ServiceCard {
  readonly name: string;
  readonly role: string;
  readonly description: string;
}

interface StackItem {
  readonly label: string;
  readonly href: string;
}

@Component({
  selector: "ix-home-page",
  standalone: true,
  imports: [
    VoltBadge,
    VoltCard,
    VoltCardContent,
    VoltCardDescription,
    VoltCardHeader,
    VoltCardTitle,
    VoltSeparator,
    MoveEnterDirective,
    LmnCloudArrowUpIcon,
    LmnCodeBracketIcon,
    LmnGithubIcon,
    LmnGlobeAltIcon,
    LmnLockOpenIcon,
    LmnServerStackIcon,
    LmnShieldCheckIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28" moveEnter="fade-up">
      <div class="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <volt-badge variant="outline">Open source · Self-hosted · MIT licensed</volt-badge>

        <h1 class="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Image delivery without the vendor lock-in
        </h1>

        <p class="max-w-2xl text-balance text-lg text-muted-foreground">
          Imageryx is an open, provider-independent image delivery and
          transformation platform. Upload once, transform on request, and
          serve from the edge — without tying your storage or transformation
          logic to a single vendor.
        </p>

        <div class="flex flex-wrap items-center justify-center gap-3">
          <a
            [href]="githubUrl"
            target="_blank"
            rel="noreferrer"
            [class]="primaryCtaClass"
          >
            <lmn-github [size]="16" />
            View on GitHub
          </a>
          <a href="#features" [class]="secondaryCtaClass">See how it works</a>
        </div>
      </div>
    </section>

    <volt-separator />

    <section id="features" class="mx-auto max-w-6xl px-6 py-20">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="text-3xl font-semibold tracking-tight text-foreground">
          Built to be owned, not rented
        </h2>
        <p class="mt-3 text-muted-foreground">
          Every layer — storage, transformation, and delivery — is an
          interchangeable provider behind the same contract. Swap Cloudflare
          Images for Cloudinary, or bring your own R2 bucket, without
          rewriting application code.
        </p>
      </div>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        @for (feature of features; track feature.title) {
          <volt-card>
            <volt-card-header>
              <div
                class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                @switch (feature.icon) {
                  @case ("lock-open") {
                    <lmn-lock-open [size]="20" />
                  }
                  @case ("globe") {
                    <lmn-globe-alt [size]="20" />
                  }
                  @case ("server-stack") {
                    <lmn-server-stack [size]="20" />
                  }
                  @case ("shield-check") {
                    <lmn-shield-check [size]="20" />
                  }
                  @case ("cloud-arrow-up") {
                    <lmn-cloud-arrow-up [size]="20" />
                  }
                  @case ("code-bracket") {
                    <lmn-code-bracket [size]="20" />
                  }
                }
              </div>
              <volt-card-title>{{ feature.title }}</volt-card-title>
              <volt-card-description>{{
                feature.description
              }}</volt-card-description>
            </volt-card-header>
          </volt-card>
        }
      </div>
    </section>

    <volt-separator />

    <section id="architecture" class="mx-auto max-w-6xl px-6 py-20">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="text-3xl font-semibold tracking-tight text-foreground">
          Four small services, one delivery pipeline
        </h2>
        <p class="mt-3 text-muted-foreground">
          Imageryx runs as a set of focused Cloudflare Workers coordinated
          through a shared domain layer — no monolith, no single point of
          failure.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        @for (service of services; track service.name) {
          <div class="rounded-lg border border-border bg-card p-5">
            <div class="mb-1 flex items-center gap-2">
              <span class="font-medium text-foreground">{{
                service.name
              }}</span>
              <volt-badge variant="secondary">{{ service.role }}</volt-badge>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ service.description }}
            </p>
          </div>
        }
      </div>
    </section>

    <volt-separator />

    <section id="stack" class="mx-auto max-w-6xl px-6 py-20">
      <div class="mx-auto mb-10 max-w-2xl text-center">
        <h2 class="text-3xl font-semibold tracking-tight text-foreground">
          Plain, modern tools
        </h2>
        <p class="mt-3 text-muted-foreground">
          No proprietary runtime, no vendor SDK lock-in — just a typed
          monorepo you can read end to end.
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3">
        @for (item of stack; track item.label) {
          <a
            [href]="item.href"
            target="_blank"
            rel="noreferrer"
            class="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {{ item.label }}
          </a>
        }
      </div>
    </section>

    <volt-separator />

    <section class="mx-auto max-w-6xl px-6 py-20 text-center">
      <h2 class="text-3xl font-semibold tracking-tight text-foreground">
        Follow along on GitHub
      </h2>
      <p class="mx-auto mt-3 max-w-xl text-muted-foreground">
        Imageryx is in active development. The source, roadmap, and
        architecture notes are all public.
      </p>
      <a
        [href]="githubUrl"
        target="_blank"
        rel="noreferrer"
        [class]="primaryCtaClass"
        class="mt-6 inline-flex"
      >
        <lmn-github [size]="16" />
        Star the repo
      </a>
    </section>
  `,
})
export default class HomePageComponent {
  protected readonly githubUrl = GITHUB_URL;

  protected readonly primaryCtaClass = buttonVariants({
    variant: "solid",
    size: "lg",
  });
  protected readonly secondaryCtaClass = buttonVariants({
    variant: "outline",
    size: "lg",
  });

  protected readonly features: readonly Feature[] = [
    {
      icon: "lock-open",
      title: "Provider-independent",
      description:
        "Storage and transformation are swappable providers behind one contract — Cloudflare Images, Cloudinary, or plain R2, your call.",
    },
    {
      icon: "globe",
      title: "Edge delivery",
      description:
        "Transformed assets are served cache-first from the edge, close to the request, not routed through a central origin.",
    },
    {
      icon: "server-stack",
      title: "Queue-driven processing",
      description:
        "Transformation jobs run off the request path on a dedicated worker, so uploads never block on pixel work.",
    },
    {
      icon: "shield-check",
      title: "Type-safe by contract",
      description:
        "A shared, versioned domain schema (Zod-based contracts) keeps every worker and the dashboard speaking the same types.",
    },
    {
      icon: "cloud-arrow-up",
      title: "Upload once",
      description:
        "One ingestion path, many derived variants — transformations are computed on request and cached, not pre-generated.",
    },
    {
      icon: "code-bracket",
      title: "Open by default",
      description:
        "MIT licensed, self-hostable, and built as a readable monorepo — no black-box SaaS in the critical path.",
    },
  ];

  protected readonly services: readonly ServiceCard[] = [
    {
      name: "API Worker",
      role: "Entry point",
      description:
        "Public entry point for auth, uploads, and transformation requests.",
    },
    {
      name: "Delivery Worker",
      role: "Edge",
      description:
        "Serves transformed assets from the edge, cache-first.",
    },
    {
      name: "Processing Worker",
      role: "Queue consumer",
      description:
        "Consumes a queue to run transformation jobs off the request path.",
    },
    {
      name: "Dashboard",
      role: "Ops",
      description:
        "Local operations UI for workspace, project, and asset visibility.",
    },
  ];

  protected readonly stack: readonly StackItem[] = [
    { label: "Cloudflare Workers", href: "https://workers.cloudflare.com" },
    { label: "Hono", href: "https://hono.dev" },
    { label: "Angular + Analog", href: "https://analogjs.org" },
    { label: "Tailwind CSS 4", href: "https://tailwindcss.com" },
    { label: "Turborepo", href: "https://turborepo.dev" },
    { label: "pnpm", href: "https://pnpm.io" },
  ];
}
