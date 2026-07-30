import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { structuredLogger } from "./middleware/logger";
import { requestId, type RequestIdVariables } from "./middleware/request-id";
import { handleQueueBatch } from "./queue/consumer";
import { healthRoute } from "./routes/health";

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

app.use("*", requestId);
app.use("*", structuredLogger);
app.use(
  "*",
  cors({
    origin: (origin, c) => (origin === c.env.DASHBOARD_URL ? origin : null),
    allowMethods: ["GET", "OPTIONS"],
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.route("/health", healthRoute);

export default {
  fetch: app.fetch,
  queue: handleQueueBatch,
} satisfies ExportedHandler<Env>;
