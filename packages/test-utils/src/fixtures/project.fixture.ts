import type { Project } from "@imageryx/contracts";

export function createProjectFixture(
  overrides: Partial<Project> = {},
): Project {
  const now = new Date().toISOString();
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    name: "Test Project",
    slug: `test-project-${id.slice(0, 8)}`,
    description: null,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
