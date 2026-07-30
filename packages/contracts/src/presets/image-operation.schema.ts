import { z } from "zod";

export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 8192;

export const imagePositionSchema = z.enum([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
export type ImagePosition = z.infer<typeof imagePositionSchema>;

export const resizeFitSchema = z.enum([
  "cover",
  "contain",
  "scale-down",
  "crop",
  "pad",
]);
export type ResizeFit = z.infer<typeof resizeFitSchema>;

/**
 * Cross-field rules (e.g. "at least one of width/height") can't live on
 * these shape schemas directly: `z.discriminatedUnion` requires plain
 * `ZodObject` members, not `ZodEffects`. Each rule is expressed once as a
 * predicate function, applied via `.refine()` on the standalone exported
 * schema (for validating one operation in isolation) and again via
 * `.superRefine()` on the union in `imageOperationSchema` below (so array
 * members are validated too).
 */
export const resizeRequiresDimension = (op: {
  width?: number;
  height?: number;
}): boolean => op.width !== undefined || op.height !== undefined;

const resizeOperationShape = z.object({
  type: z.literal("resize"),
  width: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION).optional(),
  height: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION).optional(),
  fit: resizeFitSchema,
  position: imagePositionSchema.optional(),
  withoutEnlargement: z.boolean().optional(),
});
export const resizeOperationSchema = resizeOperationShape.refine(
  resizeRequiresDimension,
  {
    message: "resize requires at least width or height",
  },
);
export type ResizeOperation = z.infer<typeof resizeOperationShape>;

const cropOperationShape = z.object({
  type: z.literal("crop"),
  x: z.number().int().min(0).max(MAX_DIMENSION),
  y: z.number().int().min(0).max(MAX_DIMENSION),
  width: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
  height: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
});
export const cropOperationSchema = cropOperationShape;
export type CropOperation = z.infer<typeof cropOperationShape>;

export const ROTATION_VALUES = [0, 90, 180, 270] as const;
export type RotationDegrees = (typeof ROTATION_VALUES)[number];

const rotateOperationShape = z.object({
  type: z.literal("rotate"),
  degrees: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
});
export const rotateOperationSchema = rotateOperationShape;
export type RotateOperation = z.infer<typeof rotateOperationShape>;

export const flipRequiresDirection = (op: {
  horizontal: boolean;
  vertical: boolean;
}): boolean => op.horizontal || op.vertical;

const flipOperationShape = z.object({
  type: z.literal("flip"),
  horizontal: z.boolean(),
  vertical: z.boolean(),
});
export const flipOperationSchema = flipOperationShape.refine(
  flipRequiresDirection,
  {
    message:
      "flip requires at least one of horizontal or vertical to be enabled",
  },
);
export type FlipOperation = z.infer<typeof flipOperationShape>;

/** SVG is deliberately excluded: this phase does not generate raster output from vector sources. */
export const outputImageFormatSchema = z.enum([
  "auto",
  "avif",
  "webp",
  "jpeg",
  "png",
]);
export type OutputImageFormat = z.infer<typeof outputImageFormatSchema>;

const formatOperationShape = z.object({
  type: z.literal("format"),
  format: outputImageFormatSchema,
});
export const formatOperationSchema = formatOperationShape;
export type FormatOperation = z.infer<typeof formatOperationShape>;

const qualityOperationShape = z.object({
  type: z.literal("quality"),
  value: z.number().int().min(1).max(100),
});
export const qualityOperationSchema = qualityOperationShape;
export type QualityOperation = z.infer<typeof qualityOperationShape>;

/** Accepts #rgb, #rrggbb, #rrggbbaa, or the literal "transparent"; normalized to lowercase hex by image-core. */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);

const backgroundOperationShape = z.object({
  type: z.literal("background"),
  color: z.union([hexColorSchema, z.literal("transparent")]),
});
export const backgroundOperationSchema = backgroundOperationShape;
export type BackgroundOperation = z.infer<typeof backgroundOperationShape>;

/** Normalized domain range, deliberately provider-agnostic (0 = no blur, 100 = maximum). Providers map this onto their own scale. */
export const MIN_BLUR = 0;
export const MAX_BLUR = 100;

const blurOperationShape = z.object({
  type: z.literal("blur"),
  value: z.number().min(MIN_BLUR).max(MAX_BLUR),
});
export const blurOperationSchema = blurOperationShape;
export type BlurOperation = z.infer<typeof blurOperationShape>;

export const MIN_SHARPEN = 0;
export const MAX_SHARPEN = 100;

const sharpenOperationShape = z.object({
  type: z.literal("sharpen"),
  value: z.number().min(MIN_SHARPEN).max(MAX_SHARPEN),
});
export const sharpenOperationSchema = sharpenOperationShape;
export type SharpenOperation = z.infer<typeof sharpenOperationShape>;

const grayscaleOperationShape = z.object({
  type: z.literal("grayscale"),
  enabled: z.literal(true),
});
export const grayscaleOperationSchema = grayscaleOperationShape;
export type GrayscaleOperation = z.infer<typeof grayscaleOperationShape>;

export const metadataModeSchema = z.enum(["keep", "strip", "strip-location"]);
export type MetadataMode = z.infer<typeof metadataModeSchema>;

const metadataOperationShape = z.object({
  type: z.literal("metadata"),
  mode: metadataModeSchema,
});
export const metadataOperationSchema = metadataOperationShape;
export type MetadataOperation = z.infer<typeof metadataOperationShape>;

export const IMAGE_OPERATION_TYPES = [
  "resize",
  "crop",
  "rotate",
  "flip",
  "format",
  "quality",
  "background",
  "blur",
  "sharpen",
  "grayscale",
  "metadata",
] as const;
export type ImageOperationType = (typeof IMAGE_OPERATION_TYPES)[number];

export const imageOperationSchema = z
  .discriminatedUnion("type", [
    resizeOperationShape,
    cropOperationShape,
    rotateOperationShape,
    flipOperationShape,
    formatOperationShape,
    qualityOperationShape,
    backgroundOperationShape,
    blurOperationShape,
    sharpenOperationShape,
    grayscaleOperationShape,
    metadataOperationShape,
  ])
  .superRefine((op, ctx) => {
    if (op.type === "resize" && !resizeRequiresDimension(op)) {
      ctx.addIssue({
        code: "custom",
        message: "resize requires at least width or height",
      });
    }
    if (op.type === "flip" && !flipRequiresDirection(op)) {
      ctx.addIssue({
        code: "custom",
        message:
          "flip requires at least one of horizontal or vertical to be enabled",
      });
    }
  });
export type ImageOperation =
  | ResizeOperation
  | CropOperation
  | RotateOperation
  | FlipOperation
  | FormatOperation
  | QualityOperation
  | BackgroundOperation
  | BlurOperation
  | SharpenOperation
  | GrayscaleOperation
  | MetadataOperation;
