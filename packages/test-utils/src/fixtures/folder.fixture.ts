import type { Folder } from "@imageryx/contracts";

export function createFolderFixture(overrides: Partial<Folder> = {}): Folder {
  const now = new Date().toISOString();
  const id = overrides.id ?? crypto.randomUUID();
  const slug = overrides.slug ?? `test-folder-${id.slice(0, 8)}`;
  return {
    id,
    projectId: crypto.randomUUID(),
    parentId: null,
    name: "Test Folder",
    slug,
    path: slug,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
