import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";

export interface SystemPresetDefinition {
  name: string;
  slug: string;
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality: number | null;
}

/**
 * The canonical system preset set, shared by the local seed script
 * (`packages/database/scripts/seed-data.ts`) and `POST /v1/projects`'
 * `withSystemPresets` flow (`createSystemPresetsForProject` below), so
 * there is exactly one definition of "the standard presets a new project
 * gets" instead of two that could drift apart.
 */
export const SYSTEM_PRESET_DEFINITIONS: readonly SystemPresetDefinition[] = [
  {
    name: "Thumbnail",
    slug: "thumbnail",
    operations: [
      {
        type: "resize",
        width: 320,
        height: 320,
        fit: "cover",
        withoutEnlargement: true,
      },
    ],
    outputFormat: "auto",
    quality: 75,
  },
  {
    name: "Avatar",
    slug: "avatar",
    operations: [
      {
        type: "resize",
        width: 512,
        height: 512,
        fit: "cover",
        withoutEnlargement: true,
      },
    ],
    outputFormat: "auto",
    quality: 80,
  },
  {
    name: "Content",
    slug: "content",
    operations: [
      { type: "resize", width: 1280, fit: "scale-down", withoutEnlargement: true },
    ],
    outputFormat: "auto",
    quality: 80,
  },
  {
    name: "Hero",
    slug: "hero",
    operations: [
      {
        type: "resize",
        width: 1920,
        height: 1080,
        fit: "cover",
        withoutEnlargement: true,
      },
    ],
    outputFormat: "auto",
    quality: 82,
  },
  {
    name: "Project Card",
    slug: "project-card",
    operations: [
      {
        type: "resize",
        width: 800,
        height: 450,
        fit: "cover",
        withoutEnlargement: true,
      },
    ],
    outputFormat: "auto",
    quality: 80,
  },
  {
    name: "Download High",
    slug: "download-high",
    operations: [
      { type: "resize", width: 3000, fit: "scale-down", withoutEnlargement: true },
    ],
    outputFormat: "jpeg",
    quality: 92,
  },
];
