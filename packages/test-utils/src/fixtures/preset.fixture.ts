import type { ImagePreset } from "@imageryx/contracts";

export function createPresetFixture(
  overrides: Partial<ImagePreset> = {},
): ImagePreset {
  const now = new Date().toISOString();
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    projectId: crypto.randomUUID(),
    name: "Test Preset",
    slug: `test-preset-${id.slice(0, 8)}`,
    description: null,
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
    isSystem: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
