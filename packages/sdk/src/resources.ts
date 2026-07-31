import type {
  CreateDownloadUrlResponse,
  CreateFolderInput,
  CreatePresetInput,
  CreateProjectInput,
  Folder,
  ImageAsset,
  ImagePreset,
  ImageVariant,
  PaginatedResponse,
  PreviewPresetResponse,
  ProcessingJob,
  ProcessingJobStatus,
  ProcessingJobType,
  StatsResponse,
  UpdateFolderInput,
  UpdatePresetInput,
  UpdateProjectInput,
} from "@imageryx/contracts";
import { ImageryxValidationError } from "./errors";
import type { HttpClient } from "./http-client";
import { seg } from "./path";
import type {
  AssetActivityEntry,
  AssetDeliveryInfo,
  AssetDetails,
  AssetListItem,
  FolderListResponse,
  ProjectSummary,
  ProjectTag,
  RequestVariantResponse,
  UploadAssetOptions,
  UploadAssetResponse,
} from "./types";

export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  list(query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortField?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  }): Promise<PaginatedResponse<ProjectSummary>> {
    return this.http.get("/v1/projects", { query });
  }

  create(input: CreateProjectInput): Promise<ProjectSummary> {
    return this.http.post("/v1/projects", { json: input });
  }

  get(id: string): Promise<ProjectSummary> {
    return this.http.get(`/v1/projects/${seg(id)}`);
  }

  update(
    id: string,
    input: Omit<UpdateProjectInput, "id">,
  ): Promise<ProjectSummary> {
    return this.http.patch(`/v1/projects/${seg(id)}`, { json: input });
  }

  delete(id: string, options?: { cascade?: boolean }): Promise<void> {
    return this.http.delete(`/v1/projects/${seg(id)}`, {
      query: { cascade: options?.cascade },
    });
  }
}

export class FoldersResource {
  constructor(private readonly http: HttpClient) {}

  list(
    projectId: string,
    options?: { tree?: boolean },
  ): Promise<FolderListResponse> {
    return this.http.get(`/v1/projects/${seg(projectId)}/folders`, {
      query: { tree: options?.tree },
    });
  }

  create(
    projectId: string,
    input: Omit<CreateFolderInput, "projectId">,
  ): Promise<Folder> {
    return this.http.post(`/v1/projects/${seg(projectId)}/folders`, {
      json: input,
    });
  }

  get(folderId: string): Promise<Folder> {
    return this.http.get(`/v1/folders/${seg(folderId)}`);
  }

  update(
    folderId: string,
    input: Partial<Pick<UpdateFolderInput, "name">> & {
      parentId?: string | null;
    },
  ): Promise<Folder> {
    return this.http.patch(`/v1/folders/${seg(folderId)}`, { json: input });
  }

  delete(folderId: string): Promise<void> {
    return this.http.delete(`/v1/folders/${seg(folderId)}`);
  }
}

export class TagsResource {
  constructor(private readonly http: HttpClient) {}

  list(projectId: string): Promise<{ items: ProjectTag[] }> {
    return this.http.get(`/v1/projects/${seg(projectId)}/tags`);
  }

  create(projectId: string, name: string): Promise<ProjectTag> {
    return this.http.post(`/v1/projects/${seg(projectId)}/tags`, {
      json: { name },
    });
  }

  update(tagId: string, name: string): Promise<ProjectTag> {
    return this.http.patch(`/v1/tags/${seg(tagId)}`, { json: { name } });
  }

  delete(tagId: string): Promise<void> {
    return this.http.delete(`/v1/tags/${seg(tagId)}`);
  }
}

export class PresetsResource {
  constructor(private readonly http: HttpClient) {}

  list(
    projectId: string,
    query?: { system?: boolean; outputFormat?: string; search?: string },
  ): Promise<{ items: ImagePreset[] }> {
    return this.http.get("/v1/presets", {
      query: {
        projectId,
        system: query?.system,
        outputFormat: query?.outputFormat,
        search: query?.search,
      },
    });
  }

  create(input: CreatePresetInput): Promise<ImagePreset> {
    return this.http.post("/v1/presets", { json: input });
  }

  get(presetId: string): Promise<ImagePreset> {
    return this.http.get(`/v1/presets/${seg(presetId)}`);
  }

  update(
    presetId: string,
    input: Omit<UpdatePresetInput, "id">,
  ): Promise<ImagePreset> {
    return this.http.patch(`/v1/presets/${seg(presetId)}`, { json: input });
  }

  delete(presetId: string): Promise<void> {
    return this.http.delete(`/v1/presets/${seg(presetId)}`);
  }

  preview(
    presetId: string,
    input?: { sourceWidth?: number; sourceHeight?: number },
  ): Promise<PreviewPresetResponse> {
    return this.http.post(`/v1/presets/${seg(presetId)}/preview`, {
      json: input ?? {},
    });
  }
}

export class VariantsResource {
  constructor(private readonly http: HttpClient) {}

  generate(
    assetId: string,
    input: { presetId: string; persist?: boolean; preferredProvider?: string },
  ): Promise<RequestVariantResponse> {
    return this.http.post(`/v1/assets/${seg(assetId)}/variants`, {
      json: input,
    });
  }
}

export class ProcessingResource {
  constructor(private readonly http: HttpClient) {}

  list(
    projectId: string,
    query?: {
      assetId?: string;
      type?: ProcessingJobType;
      status?: ProcessingJobStatus;
      page?: number;
      pageSize?: number;
    },
  ): Promise<PaginatedResponse<ProcessingJob>> {
    return this.http.get("/v1/processing-jobs", {
      query: { projectId, ...query },
    });
  }

  get(jobId: string): Promise<ProcessingJob> {
    return this.http.get(`/v1/processing-jobs/${seg(jobId)}`);
  }

  retry(jobId: string): Promise<ProcessingJob> {
    return this.http.post(`/v1/processing-jobs/${seg(jobId)}/retry`);
  }

  cancel(jobId: string): Promise<ProcessingJob> {
    return this.http.post(`/v1/processing-jobs/${seg(jobId)}/cancel`);
  }
}

function toFormValue(value: unknown): string {
  return typeof value === "boolean" ? String(value) : String(value);
}

export class AssetsResource {
  constructor(private readonly http: HttpClient) {}

  async upload(options: UploadAssetOptions): Promise<UploadAssetResponse> {
    if (!options.projectId)
      throw new ImageryxValidationError("projectId is required.");
    if (!options.file) throw new ImageryxValidationError("file is required.");

    const formData = new FormData();
    const fileName =
      options.fileName ??
      (options.file instanceof File ? options.file.name : "upload");
    formData.set("file", options.file, fileName);
    formData.set("projectId", options.projectId);
    if (options.folderId) formData.set("folderId", options.folderId);
    if (options.name) formData.set("name", options.name);
    if (options.tags)
      for (const tag of options.tags) formData.append("tags", tag);
    if (options.visibility) formData.set("visibility", options.visibility);
    if (options.downloadOriginalEnabled !== undefined) {
      formData.set(
        "downloadOriginalEnabled",
        toFormValue(options.downloadOriginalEnabled),
      );
    }

    return this.http.post("/v1/assets/upload", { formData });
  }

  list(
    projectId: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<PaginatedResponse<AssetListItem>> {
    return this.http.get("/v1/assets", { query: { projectId, ...query } });
  }

  get(assetId: string): Promise<AssetDetails> {
    return this.http.get(`/v1/assets/${seg(assetId)}`);
  }

  update(
    assetId: string,
    input: Partial<{
      name: string;
      slug: string;
      visibility: "public" | "private";
      downloadOriginalEnabled: boolean;
    }>,
  ): Promise<ImageAsset> {
    return this.http.patch(`/v1/assets/${seg(assetId)}`, { json: input });
  }

  move(assetId: string, folderId: string | null): Promise<ImageAsset> {
    return this.http.post(`/v1/assets/${seg(assetId)}/move`, {
      json: { folderId },
    });
  }

  setTags(assetId: string, tags: string[]): Promise<{ tags: string[] }> {
    return this.http.put(`/v1/assets/${seg(assetId)}/tags`, { json: { tags } });
  }

  delete(assetId: string): Promise<void> {
    return this.http.delete(`/v1/assets/${seg(assetId)}`);
  }

  restore(assetId: string): Promise<ImageAsset> {
    return this.http.post(`/v1/assets/${seg(assetId)}/restore`);
  }

  variants(assetId: string): Promise<{ items: ImageVariant[] }> {
    return this.http.get(`/v1/assets/${seg(assetId)}/variants`);
  }

  activity(assetId: string): Promise<{ items: AssetActivityEntry[] }> {
    return this.http.get(`/v1/assets/${seg(assetId)}/activity`);
  }

  delivery(assetId: string): Promise<AssetDeliveryInfo> {
    return this.http.get(`/v1/assets/${seg(assetId)}/delivery`);
  }

  createDownloadUrl(
    assetId: string,
    input?: { variant?: string; expiresIn?: number },
  ): Promise<CreateDownloadUrlResponse> {
    return this.http.post(`/v1/assets/${seg(assetId)}/download-url`, {
      json: input ?? {},
    });
  }
}

export class StatsResource {
  constructor(private readonly http: HttpClient) {}

  get(): Promise<StatsResponse> {
    return this.http.get("/v1/stats");
  }
}
