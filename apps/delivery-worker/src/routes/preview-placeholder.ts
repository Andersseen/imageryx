import { Hono } from 'hono';
import type { RequestIdVariables } from '../middleware/request-id';
import { renderPlaceholderSvg } from '../lib/placeholder-svg';

export const previewPlaceholderRoute = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

previewPlaceholderRoute.get('/', (c) => {
  const svg = renderPlaceholderSvg(c.req.query('w') ?? null, c.req.query('h') ?? null);

  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});
