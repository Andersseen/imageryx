import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PresetRepository } from "../repositories/preset.repository";
import { SYSTEM_PRESET_DEFINITIONS } from "../presets/system-presets";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestProject } from "../testing/fixtures";
import { PresetPersistenceService } from "./preset-persistence.service";

describe("PresetPersistenceService", () => {
  let testDb: TestDatabase;
  let service: PresetPersistenceService;
  let presets: PresetRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    service = new PresetPersistenceService(testDb.db);
    presets = new PresetRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("createPreset creates a real preset row", async () => {
    const preset = await service.createPreset({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail",
      operations: [],
      outputFormat: "auto",
    });

    expect(preset.id).toBeTruthy();
    expect(await presets.findById(preset.id)).not.toBeNull();
  });

  it("createSystemPresetsForProject creates every defined system preset, flagged isSystem", async () => {
    const created = await service.createSystemPresetsForProject(projectId);

    expect(created).toHaveLength(SYSTEM_PRESET_DEFINITIONS.length);
    expect(created.every((preset) => preset.isSystem)).toBe(true);
    expect(created.map((preset) => preset.slug).sort()).toEqual(
      SYSTEM_PRESET_DEFINITIONS.map((definition) => definition.slug).sort(),
    );
  });

  it("createSystemPresetsForProject is idempotent — a second call creates nothing new", async () => {
    await service.createSystemPresetsForProject(projectId);
    const secondRun = await service.createSystemPresetsForProject(projectId);

    expect(secondRun).toHaveLength(0);
    const all = await presets.listByProject(projectId);
    expect(all.filter((preset) => preset.isSystem)).toHaveLength(
      SYSTEM_PRESET_DEFINITIONS.length,
    );
  });

  it("createSystemPresetsForProject only fills in whichever system presets are missing", async () => {
    const firstDefinition = SYSTEM_PRESET_DEFINITIONS[0]!;
    await presets.create({
      projectId,
      name: firstDefinition.name,
      slug: firstDefinition.slug,
      operations: [...firstDefinition.operations],
      outputFormat: firstDefinition.outputFormat,
      quality: firstDefinition.quality,
      isSystem: true,
    });

    const created = await service.createSystemPresetsForProject(projectId);

    expect(created).toHaveLength(SYSTEM_PRESET_DEFINITIONS.length - 1);
    expect(created.some((preset) => preset.slug === firstDefinition.slug)).toBe(false);
  });

  it("system presets created for different projects never collide", async () => {
    const otherProjectId = (await insertTestProject(testDb.db)).id;

    const first = await service.createSystemPresetsForProject(projectId);
    const second = await service.createSystemPresetsForProject(otherProjectId);

    expect(first).toHaveLength(SYSTEM_PRESET_DEFINITIONS.length);
    expect(second).toHaveLength(SYSTEM_PRESET_DEFINITIONS.length);
    expect(new Set(first.map((preset) => preset.id))).not.toEqual(
      new Set(second.map((preset) => preset.id)),
    );
  });
});
