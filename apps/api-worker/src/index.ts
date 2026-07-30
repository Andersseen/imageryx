import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireApiKey } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { structuredLogger } from "./middleware/logger";
import { requestId, type RequestIdVariables } from "./middleware/request-id";
import { databaseDiagnosticsRoute } from "./routes/diagnostics/database";
import { domainDiagnosticsRoute } from "./routes/diagnostics/domain";
import { providersDiagnosticsRoute } from "./routes/diagnostics/providers";
import { seedDiagnosticsRoute } from "./routes/diagnostics/seed";
import { healthRoute } from "./routes/health";
import { infoRoute } from "./routes/info";
import { assetsRoute } from "./routes/v1/assets";
import { foldersRoute } from "./routes/v1/folders";
import { presetsRoute } from "./routes/v1/presets";
import { processingJobsRoute } from "./routes/v1/processing-jobs";
import { projectsRoute } from "./routes/v1/projects";
import { statsRoute } from "./routes/v1/stats";
import { tagsRoute } from "./routes/v1/tags";

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

app.use("*", requestId);
app.use("*", structuredLogger);
app.use(
  "*",
  cors({
    origin: (origin, c) => (origin === c.env.DASHBOARD_URL ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.route("/health", healthRoute);

// Every /v1/* route requires a Bearer API key — see middleware/auth.ts. Applied once here rather
// than per route file, so no future route can accidentally ship unauthenticated.
app.use("/v1/*", requireApiKey);

app.route("/v1/info", infoRoute);
app.route("/v1/diagnostics/domain", domainDiagnosticsRoute);
app.route("/v1/diagnostics/database", databaseDiagnosticsRoute);
app.route("/v1/diagnostics/providers", providersDiagnosticsRoute);
app.route("/v1/diagnostics/seed", seedDiagnosticsRoute);

app.route("/v1/projects", projectsRoute);
app.route("/v1/folders", foldersRoute);
app.route("/v1/tags", tagsRoute);
app.route("/v1/presets", presetsRoute);
app.route("/v1/assets", assetsRoute);
app.route("/v1/processing-jobs", processingJobsRoute);
app.route("/v1/stats", statsRoute);

export default app;
