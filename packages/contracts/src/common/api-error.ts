import { z } from "zod";

/**
 * Stable public error shape. `details` must only ever hold values already
 * safe to show a client (validation field names, limits) — never stack
 * traces, provider responses, or secrets. Enforcing that is a call-site
 * responsibility; this schema only fixes the envelope shape.
 */
export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiErrorResponse {
  error: ApiError;
}
