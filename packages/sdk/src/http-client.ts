import { ImageryxApiError, ImageryxNetworkError } from "./errors";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  json?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
}

export interface HttpClientConfig {
  baseUrl: string;
  apiKey?: string;
  fetch: typeof globalThis.fetch;
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; requestId?: string; details?: Record<string, unknown> };
}

/**
 * The one place every SDK method funnels through — normalizes errors
 * (`ImageryxApiError` for well-formed non-2xx responses,
 * `ImageryxNetworkError` for a `fetch` rejection) so callers never need
 * to inspect a raw `Response`.
 */
export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), `${this.config.baseUrl.replace(/\/+$/, "")}/`);
    appendQuery(url, options.query);

    const headers: Record<string, string> = { ...options.headers };
    if (this.config.apiKey) headers["Authorization"] = `Bearer ${this.config.apiKey}`;

    let body: FormData | string | undefined;
    if (options.formData) {
      body = options.formData;
    } else if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    }

    let response: Response;
    try {
      response = await this.config.fetch(url.toString(), { method, headers, body });
    } catch (error) {
      throw new ImageryxNetworkError("The request could not be sent.", error);
    }

    if (!response.ok) {
      let envelope: ApiErrorEnvelope | null = null;
      try {
        envelope = (await response.json()) as ApiErrorEnvelope;
      } catch {
        envelope = null;
      }
      throw new ImageryxApiError(envelope?.error?.message ?? response.statusText, {
        status: response.status,
        code: envelope?.error?.code ?? "unknown_error",
        requestId: envelope?.error?.requestId,
        details: envelope?.error?.details,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, options);
  }
  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, options);
  }
  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, options);
  }
  put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, options);
  }
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }
}
