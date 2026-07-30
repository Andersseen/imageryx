import type { DeliveryResource } from "./delivery";

export interface SnippetInput {
  project: string;
  asset: string;
  preset?: string;
  alt: string;
  width?: number;
  height?: number;
}

export class SnippetsResource {
  constructor(private readonly delivery: DeliveryResource) {}

  html(input: SnippetInput): string {
    const url = input.preset
      ? this.delivery.presetUrl(input.project, input.asset, input.preset)
      : this.delivery.originalUrl(input.project, input.asset);
    const dims =
      input.width !== undefined && input.height !== undefined
        ? ` width="${input.width}" height="${input.height}"`
        : "";
    return `<img src="${url}" alt="${escapeAttribute(input.alt)}"${dims} loading="lazy" />`;
  }

  angular(input: SnippetInput): string {
    const attrs = [
      `project="${input.project}"`,
      `asset="${input.asset}"`,
      input.preset ? `preset="${input.preset}"` : null,
      `alt="${escapeAttribute(input.alt)}"`,
      input.width !== undefined ? `[width]="${input.width}"` : null,
      input.height !== undefined ? `[height]="${input.height}"` : null,
    ].filter((attr): attr is string => attr !== null);
    return `<imgyx-image\n  ${attrs.join("\n  ")}\n/>`;
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
