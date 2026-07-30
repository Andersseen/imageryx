import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { structuredLogger } from './middleware/logger';
import { requestId, type RequestIdVariables } from './middleware/request-id';
import { healthRoute } from './routes/health';
import { infoRoute } from './routes/info';

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

app.use('*', requestId);
app.use('*', structuredLogger);
app.use(
  '*',
  cors({
    origin: (origin, c) => (origin === c.env.DASHBOARD_URL ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.route('/health', healthRoute);
app.route('/v1/info', infoRoute);

export default app;
