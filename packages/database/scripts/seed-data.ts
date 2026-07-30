import { SYSTEM_PRESET_DEFINITIONS } from "../src/presets/system-presets";

export interface SeedFolder {
  name: string;
  slug: string;
  path: string;
  /** Slug of another folder in the same project's `folders` array that must appear earlier in the list. */
  parentSlug?: string;
}

export interface SeedFixtureAsset {
  label: string;
  originalFilename: string;
  slug: string;
  path: string;
  folderSlug: string;
}

export interface SeedProject {
  name: string;
  slug: string;
  folders: SeedFolder[];
  fixtureAssets: SeedFixtureAsset[];
}

export const SEED_PROJECTS: readonly SeedProject[] = [
  {
    name: "Andersseen Portfolio",
    slug: "andersseen-portfolio",
    folders: [
      { name: "Profile", slug: "profile", path: "profile" },
      { name: "Projects", slug: "projects", path: "projects" },
      { name: "Articles", slug: "articles", path: "articles" },
    ],
    fixtureAssets: [
      {
        label: "Profile Placeholder",
        originalFilename: "andrii-profile.svg",
        slug: "andrii",
        path: "profile/andrii",
        folderSlug: "profile",
      },
      {
        label: "Projects Cover Placeholder",
        originalFilename: "projects-cover.svg",
        slug: "cover",
        path: "projects/cover",
        folderSlug: "projects",
      },
    ],
  },
  {
    name: "Angular Lab",
    slug: "angular-lab",
    folders: [
      { name: "Courses", slug: "courses", path: "courses" },
      { name: "Lessons", slug: "lessons", path: "lessons" },
      { name: "Social", slug: "social", path: "social" },
      {
        name: "Signals",
        slug: "signals",
        path: "courses/signals",
        parentSlug: "courses",
      },
    ],
    fixtureAssets: [
      {
        label: "Signals Course Hero",
        originalFilename: "signals-hero.svg",
        slug: "hero",
        path: "courses/signals/hero",
        folderSlug: "signals",
      },
      {
        label: "Social Preview Placeholder",
        originalFilename: "social-preview.svg",
        slug: "preview",
        path: "social/preview",
        folderSlug: "social",
      },
    ],
  },
];

export const SEED_TAGS: readonly string[] = [
  "portfolio",
  "cover",
  "profile",
  "course",
  "lesson",
  "social",
  "documentation",
];

/**
 * The seed script's system presets are now exactly `@imageryx/database`'s
 * `SYSTEM_PRESET_DEFINITIONS` (see `src/presets/system-presets.ts`) — the
 * same list `POST /v1/projects`' `withSystemPresets` flow uses, so a
 * seeded project and an API-created project always get identical presets.
 */
export const SEED_PRESETS = SYSTEM_PRESET_DEFINITIONS;

/** A tiny, deterministic, code-generated placeholder — never a committed binary. Clearly labeled as local development fixture data, both in its own content and in the asset name the seed script assigns it. */
export function generateFixtureSvg(label: string): string {
  const width = 320;
  const height = 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} (Imageryx local development fixture)">
  <rect width="${width}" height="${height}" fill="#e2e8f0" />
  <rect width="${width}" height="${height}" fill="none" stroke="#94a3b8" stroke-width="2" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" fill="#475569">${label}</text>
</svg>`;
}
