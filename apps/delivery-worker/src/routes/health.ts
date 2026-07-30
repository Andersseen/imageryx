import { Hono } from "hono";
import type { HealthCheckResponse } from "@imageryx/contracts";
import type { RequestIdVariables } from "../middleware/request-id";
import { VERSION } from "../version";

export const healthRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

healthRoute.get("/", (c) => {
  const body: HealthCheckResponse = {
    service: "delivery-worker",
    status: "healthy",
    environment: c.env.APP_ENV,
    version: VERSION,
    timestamp: new Date().toISOString(),
  };

  return c.json(body);
});
