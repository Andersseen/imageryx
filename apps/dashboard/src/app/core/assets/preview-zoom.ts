export type ZoomMode = "fit" | "actual" | "custom";

export interface ZoomState {
  mode: ZoomMode;
  /** Multiplier applied to the image's natural size. 1 = actual size. */
  scale: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

export const FIT_STATE: ZoomState = { mode: "fit", scale: 1 };
export const ACTUAL_SIZE_STATE: ZoomState = { mode: "actual", scale: 1 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * The preview's zoom state machine — pure so the math (clamping, step size) is testable without
 * a rendered `<img>`. `"fit"` and `"actual"` are distinct *modes*, not just a scale value: "fit"
 * means "however large the container is," which only the component (which knows the container
 * and natural image size) can turn into a CSS transform. Zooming in/out from "fit" switches to
 * "custom" at a concrete multiplier — otherwise the first zoom-in step would be relative to an
 * unknown baseline.
 */
export function zoomIn(state: ZoomState): ZoomState {
  const base = state.mode === "fit" ? 1 : state.scale;
  return { mode: "custom", scale: clampScale(base * ZOOM_STEP) };
}

export function zoomOut(state: ZoomState): ZoomState {
  const base = state.mode === "fit" ? 1 : state.scale;
  return { mode: "custom", scale: clampScale(base / ZOOM_STEP) };
}

export function resetZoom(): ZoomState {
  return FIT_STATE;
}

export function setActualSize(): ZoomState {
  return ACTUAL_SIZE_STATE;
}

export function canZoomIn(state: ZoomState): boolean {
  const base = state.mode === "fit" ? 1 : state.scale;
  return base * ZOOM_STEP <= MAX_SCALE + 1e-9;
}

export function canZoomOut(state: ZoomState): boolean {
  const base = state.mode === "fit" ? 1 : state.scale;
  return base / ZOOM_STEP >= MIN_SCALE - 1e-9;
}

export function zoomPercentLabel(
  state: ZoomState,
  naturalToContainerRatio: number | null,
): string {
  if (state.mode === "fit") {
    if (naturalToContainerRatio === null) return "Fit";
    return `Fit (${Math.round(naturalToContainerRatio * 100)}%)`;
  }
  return `${Math.round(state.scale * 100)}%`;
}
