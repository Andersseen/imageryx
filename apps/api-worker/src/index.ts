import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { structuredLogger } from "./middleware/logger";
import { requestId, type RequestIdVariables } from "./middleware/request-id";
import { databaseDiagnosticsRoute } from "./routes/diagnostics/database";
import { domainDiagnosticsRoute } from "./routes/diagnostics/domain";
import { providersDiagnosticsRoute } from "./routes/diagnostics/providers";
import { seedDiagnosticsRoute } from "./routes/diagnostics/seed";
import { healthRoute } from "./routes/health";
import { infoRoute } from "./routes/info";

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

app.use("*", requestId);
app.use("*", structuredLogger);
app.use(
  "*",
  cors({
    origin: (origin, c) => (origin === c.env.DASHBOARD_URL ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.route("/health", healthRoute);
app.route("/v1/info", infoRoute);
app.route("/v1/diagnostics/domain", domainDiagnosticsRoute);
app.route("/v1/diagnostics/database", databaseDiagnosticsRoute);
app.route("/v1/diagnostics/providers", providersDiagnosticsRoute);
app.route("/v1/diagnostics/seed", seedDiagnosticsRoute);

export default app;
