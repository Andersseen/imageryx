import { DeliveryResource } from "./delivery";
import { HttpClient } from "./http-client";
import {
  AssetsResource,
  FoldersResource,
  PresetsResource,
  ProcessingResource,
  ProjectsResource,
  StatsResource,
  TagsResource,
  VariantsResource,
} from "./resources";
import { SnippetsResource } from "./snippets";

export interface ImageryxClientConfig {
  /** api-worker base URL, e.g. `http://localhost:8787`. */
  baseUrl: string;
  /** delivery-worker base URL, e.g. `http://localhost:8788`. */
  deliveryUrl: string;
  /**
   * Server-side only. Never pass this from browser code that ships to
   * end users — see README's "Authentication" section for the local
   * development proxy pattern the dashboard uses instead.
   */
  apiKey?: string;
  /** Inject a custom `fetch` (tests, non-standard runtimes). Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

export class ImageryxClient {
  readonly projects: ProjectsResource;
  readonly folders: FoldersResource;
  readonly tags: TagsResource;
  readonly presets: PresetsResource;
  readonly assets: AssetsResource;
  readonly variants: VariantsResource;
  readonly processing: ProcessingResource;
  readonly stats: StatsResource;
  readonly delivery: DeliveryResource;
  readonly snippets: SnippetsResource;

  constructor(config: ImageryxClientConfig) {
    const http = new HttpClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    });

    this.projects = new ProjectsResource(http);
    this.folders = new FoldersResource(http);
    this.tags = new TagsResource(http);
    this.presets = new PresetsResource(http);
    this.assets = new AssetsResource(http);
    this.variants = new VariantsResource(http);
    this.processing = new ProcessingResource(http);
    this.stats = new StatsResource(http);
    this.delivery = new DeliveryResource({ deliveryUrl: config.deliveryUrl });
    this.snippets = new SnippetsResource(this.delivery);
  }
}

export function createImageryxClient(config: ImageryxClientConfig): ImageryxClient {
  return new ImageryxClient(config);
}
