import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { structuredLogger } from "./middleware/logger";
import { requestId, type RequestIdVariables } from "./middleware/request-id";
import { deliveryRoute } from "./routes/delivery";
import { downloadRoute } from "./routes/download";
import { healthRoute } from "./routes/health";

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

app.use("*", requestId);
app.use("*", structuredLogger);
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.route("/health", healthRoute);
app.route("/download", downloadRoute);
app.route("/", deliveryRoute);

export default app;
