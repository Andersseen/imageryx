import { buildDeliveryUrl } from "@imageryx/image-core";

export interface DeliveryConfig {
  deliveryUrl: string;
}

export interface ResponsivePresetEntry {
  preset: string;
  width: number;
}

export class DeliveryResource {
  constructor(private readonly config: DeliveryConfig) {}

  originalUrl(project: string, asset: string): string {
    return buildDeliveryUrl(this.config.deliveryUrl, project, asset);
  }

  presetUrl(project: string, asset: string, preset: string): string {
    return buildDeliveryUrl(this.config.deliveryUrl, project, asset, preset);
  }

  /** Builds a `srcset` attribute value from a set of preset/width pairs — width descriptors, not density descriptors. */
  srcset(project: string, asset: string, presets: readonly ResponsivePresetEntry[]): string {
    return presets
      .map((entry) => `${this.presetUrl(project, asset, entry.preset)} ${entry.width}w`)
      .join(", ");
  }
}
